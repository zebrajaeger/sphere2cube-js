const fs = require('fs');
const path = require('path');
const {performance,} = require('perf_hooks');

const archiver = require('archiver');
const humanizeDuration = require("humanize-duration");
const prettyBytes = require('pretty-bytes');

const cliProgress = require('cli-progress');
const {PSD} = require('./psd');
const {IMG} = require('./img');
const {Bilinear} = require('./scale');
const pannellum = require('./pannellum');
const {FaceRenderer, PreviewRenderer} = require('./renderer');

const b1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

module.exports.defaultFaceName = defaultFaceName = {
    0: {filePrefix: 'b', name: 'Back'},
    1: {filePrefix: 'l', name: 'Left'},
    2: {filePrefix: 'f', name: 'Front'},
    3: {filePrefix: 'r', name: 'Right'},
    4: {filePrefix: 'u', name: 'Top'},
    5: {filePrefix: 'd', name: 'Bottom'}
};

module.exports.renderPano = renderPano;

async function renderPano(sourcePath, targetFolder, config, faceName) {
    let srcImage;
    const filesToZip = [];
    const startTime = performance.now();

    faceName = faceName || defaultFaceName;

    console.log({sourcePath}, sourcePath.toLowerCase().endsWith('.psd') || sourcePath.toLowerCase().endsWith('.psb'));

    // load Source Image
    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log('| Load Image');
    console.log('+------------------------------------------------------------------------')
    if (sourcePath.toLowerCase().endsWith('.psd') || sourcePath.toLowerCase().endsWith('.psb')) {
        srcImage = new PSD();
        srcImage.on('begin', lineCount => b1.start(lineCount - 1, 0, {speed: "N/A"}));
        srcImage.on('progress', line => b1.update(line));
        srcImage.on('end', () => b1.stop())
        await srcImage.load(sourcePath);
    } else {
        srcImage = new IMG();
        if (!await srcImage.load(sourcePath)) {
            throw 'Unsupported image file type'
        }
    }

    // equirectangular outer bound
    const outerWidth = config.panoAngle === 360 ? srcImage.width : Math.floor(srcImage.width * 360 / config.panoAngle);
    const outerHeight = Math.floor(outerWidth / 2);
    console.log({angel: config.panoAngle})
    // const xAngle =  srcImage.width*180/outerWidth;
    // const yAngle =  srcImage.height*180/outerHeight;

    // offset foy y-center pos
    const yShift = Math.floor(outerHeight * config.panoYOffset / 180);
    const yOff = Math.floor((outerHeight - srcImage.height) / 2) - yShift;
    const xOff = Math.floor((outerWidth - srcImage.width) / 2);
    console.log({outerWidth, outerHeight, srcImageWidth: srcImage.width, srcImageHeight: srcImage.height})
    console.log({xOff, yOff})

    if (!config.previewIgnore) {
        preview1(config, srcImage, outerWidth, xOff, yOff, filesToZip);
        preview2(srcImage, config, filesToZip);
    }

    let maxLevelToRender = 0;
    const targetImageSize = config.targetImgSize || Math.floor(srcImage.width / 4);
    if (!config.tilesIgnore) {
        maxLevelToRender = tiles(srcImage, outerWidth, xOff, yOff, faceName, targetImageSize, config, maxLevelToRender, targetFolder);
    }

    if (!config.htmlIgnore) {
        const hAngel = srcImage.height * 180 / outerHeight
        const area = {
            x: {min: config.panoAngle / -2, max: config.panoAngle / 2},
            y: {min: (hAngel / -2) + config.panoYOffset, max: (hAngel / 2) + config.panoYOffset}
        }
        html(config, maxLevelToRender, targetImageSize, targetFolder, area);
        filesToZip.push('./index.html')
    }

    if (!config.zipIgnore) {
        await zip(config, filesToZip);
    }

    const endTime = performance.now();
    const runtime = humanizeDuration(round(endTime - startTime, -2));
    console.log();
    console.log('+------------------------------------------------------------------------')
    console.log(`| finished in ${runtime}`);
    console.log('+------------------------------------------------------------------------')
}

function zip(config, filesToZip) {
    return new Promise((resolve, reject) => {

        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log('| ZIP')
        console.log('+------------------------------------------------------------------------')

        let progress = false;

        let zipStream = fs.createWriteStream(config.zipPath);
        zipStream.on('close', () => {
            console.log(`File Size: ${prettyBytes(archive.pointer())}`);
            resolve();
        });
        zipStream.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                console.log('Warning', err)
            } else {
                reject(err);
            }
        });
        zipStream.on('error', function (err) {
            reject(err);
        });

        let archive = archiver('zip', {
            zlib: {level: 9} // Sets the compression level.
        });
        archive.on('progress', function (progressData) {
            if (!progress) {
                b1.start(progressData.entries.total, progressData.entries.processed);
                progress = true;
            } else {
                b1.update(progressData.entries.processed);
                if (progressData.entries.total === progressData.entries.processed) {
                    b1.stop()
                }
            }
        });
        archive.pipe(zipStream);

        // collect single files
        filesToZip.forEach(f => {
            const p = path.resolve(f);
            const pp = path.parse(p);
            console.log(`Add file '${p}' as  '${pp.base}'`)
            archive.file(p, {name: pp.base})
        });

        // collect level directories
        for (let i = 1; fs.existsSync(i.toString()); i++) {
            const p = i.toString();
            if (fs.existsSync(p)) {
                console.log(`Add dir '${p}' as  '${p}'`)
                archive.directory(path.resolve(p), p, {});
            }
        }

        archive.finalize();
    });
}

function html(config, maxLevelToRender, targetImageSize, targetFolder, area) {
    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log('| Render Html')
    console.log('+------------------------------------------------------------------------')

    let data = {
        tileSize: config.tileSize,
        autoLoad: true,
        maxLevelToRender,
        targetImageSize,
        previewPath: config.previewPath,
        title: config.htmlTitle,
        area
    };
    const html = pannellum.createHtml(data);
    console.log({data})
    fs.writeFileSync(path.resolve(targetFolder, 'index.html'), html)
}

function tiles(srcImage, w, xOff, yOff, faceName, targetImageSize, config, maxLevelToRender, targetFolder) {
    const faceRenderer = new FaceRenderer(srcImage, w, xOff, yOff);
    for (let face = 0; face < 6; ++face) {
        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log(`| Render Face (${face + 1}/6) ${faceName[face].name}...`)
        console.log('+------------------------------------------------------------------------')
        faceRenderer.on('begin', count => b1.start(count - 1, 0, {speed: "N/A"}));
        faceRenderer.on('progress', v => b1.update(v));
        faceRenderer.on('end', () => b1.stop())
        let faceImg = faceRenderer.render(face, targetImageSize);
        // faceImg.write(`./${faceName[face].filePrefix}_face.jpg`);
        console.log(`...done`)

        const maxLevel = getMaxLevel(faceImg.width, faceImg.height, config.tileSize);
        maxLevelToRender = Math.max(maxLevelToRender, maxLevel);

        for (let level = maxLevel; level >= 0; level--) {
            const levelPath = path.resolve(targetFolder, `${level + 1}`);
            fs.mkdirSync(levelPath, {recursive: true});
            console.log(`  Render Level: ${level}`)
            const countX = Math.ceil(faceImg.height / config.tileSize);
            const countY = Math.ceil(faceImg.width / config.tileSize);

            const imgCount = countX * countY;
            b1.start(imgCount, 0, {speed: "N/A"})
            for (let y = 0; y < countY; y++) {
                for (let x = 0; x < countX; x++) {
                    const tilePath = path.resolve(levelPath, `${faceName[face].filePrefix}${y}_${x}.png`);
                    writeTile(faceImg, x, y, config.tileSize, config.tileQuality, tilePath);
                    b1.update((y * countX) + x + 1);
                }
            }
            b1.stop()

            faceImg = faceImg.newScaledByFactor(0.5);
        }
    }
    return maxLevelToRender;
}

function preview1(config, srcImage, outerWidth, xOff, yOff, filesToZip) {
    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log(`| Render cubic preview(${config.previewWidth}x${config.previewWidth * 3 / 4}; xOff: ${xOff}, yOff:${yOff})`)
    console.log('+------------------------------------------------------------------------')
    const previewRenderer = new PreviewRenderer(srcImage, outerWidth, xOff, yOff);
    let prevImg1 = previewRenderer.render(config.previewWidth);
    prevImg1.write(config.previewPath);
    filesToZip.push(config.previewPath);
    prevImg1 = null;
}

function preview2(srcImage, config, filesToZip) {
    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log('| Render scaled preview');
    console.log('+------------------------------------------------------------------------')
    let src = srcImage;
    const pMax = 1000;
    const f = Math.sqrt(2);

    for (; ;) {
        const toScale = Math.max(src.width / pMax, src.height / pMax);
        let n = Math.min(f, toScale);
        console.log('Downscale for Preview', {toScale, n})
        if (n === 1) {
            const po = path.parse(config.previewPath);
            po.name += '.eq'
            po.base = po.name + po.ext;
            const p2 = path.format(po)
            src.write(p2);
            filesToZip.push(p2);
            break;
        }

        const tempImg = new IMG();
        tempImg.create(src.width / n, src.height / n);

        const bilinear = new Bilinear();
        bilinear.on('begin', lineCount => b1.start(lineCount - 1, 0, {speed: "N/A"}));
        bilinear.on('progress', line => b1.update(line));
        bilinear.on('end', () => b1.stop())
        bilinear.scale(
            {w: src.width, h: src.height},
            {w: tempImg.width, h: tempImg.height},
            (x, y) => {
                return src.getPixel(x, y)
            },
            (x, y, pixel) => {
                tempImg.setPixel(x, y, pixel)
            });
        src = tempImg;
    }
}

function writeTile(sourceImage, xOffset, yOffset, tileSize, tileQuality, path) {
    let offX = xOffset * tileSize;
    let offY = yOffset * tileSize;
    let imgX = Math.min(tileSize, sourceImage.width - offX);
    let imgY = Math.min(tileSize, sourceImage.height - offY);

    const tile = new IMG();
    tile.create(imgX, imgY);
    for (let y = 0; y < imgY; ++y) {
        for (let x = 0; x < imgX; ++x) {
            const pixel = sourceImage.getPixel(offX + x, offY + y);
            tile.setPixel(x, y, pixel);
        }
    }
    tile.write(path, {jpgQuality: tileQuality});
}

function getMaxLevel(imgX, imgY, tile) {
    let level = 0;
    while (imgX > tile || imgY > tile) {
        level++;
        imgX = Math.round(imgX * 0.5);
        imgY = Math.round(imgY * 0.5);
    }
    return level;
}

function round(value, exp) {
    if (typeof exp === 'undefined' || +exp === 0)
        return Math.round(value);

    value = +value;
    exp = +exp;

    if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0))
        return NaN;

    // Shift
    value = value.toString().split('e');
    value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp)));

    // Shift back
    value = value.toString().split('e');
    return +(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp));
}
