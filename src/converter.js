const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

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
    const outerWidth = config.angel === 360 ? srcImage.width : Math.floor(srcImage.width * 360 / config.angel);
    const outerHeight = Math.floor(outerWidth / 2);
    // const xAngle =  srcImage.width*180/outerWidth;
    // const yAngle =  srcImage.height*180/outerHeight;

    // offset foy y-center pos
    const yShift = Math.floor(outerHeight * config.yOffset / 180);
    const yOff = Math.floor((outerHeight - srcImage.height) / 2) - yShift;
    const xOff = Math.floor((outerWidth - srcImage.width) / 2);
    console.log({xOff, yOff})

    if (!config.previewIgnore) {
        // render preview 1
        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log(`| Render preview(${config.previewWidth}x${config.previewWidth * 3 / 4}):`)
        console.log('+------------------------------------------------------------------------')
        const previewRenderer = new PreviewRenderer(srcImage, xOff, yOff);
        let prevImg1 = previewRenderer.render(config.previewWidth);
        prevImg1.write(config.previewPath);
        filesToZip.push(config.previewPath);
        prevImg1 = null;

        // render preview 2
        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log('| Render Preview 2');
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

    let maxLevelToRender = 0;
    const targetImageSize = config.targetImgSize || Math.floor(srcImage.width / 4);
    if (!config.tilesIgnore) {
        // render faces
        // console.log(`Render Faces (${targetImageSize}x${targetImageSize}):`)

        // create tiles
        const faceRenderer = new FaceRenderer(srcImage, xOff, yOff);
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
    }

    if (!config.htmlIgnore) {
        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log('| Render Html')
        console.log('+------------------------------------------------------------------------')
        const html = pannellum.createHtml({
            tileSize: config.tileSize,
            maxLevelToRender,
            targetImageSize, previewPath:
            config.previewPath
        });
        fs.writeFileSync(path.resolve(targetFolder, 'index.html'), html)
        filesToZip.push('./index.html')
    }

    if (!config.zipIgnore) {
        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log('| ZIP')
        console.log('+------------------------------------------------------------------------')

        let zipStream = fs.createWriteStream(config.zipPath);
        let archive = archiver('zip', {
            zlib: {level: 9} // Sets the compression level.
        });
        archive.pipe(zipStream);

        // collect single files
        filesToZip.forEach(f => {
            const p = path.resolve( f);
            const pp = path.parse(p);
            console.log('Add file', p, pp.base)
            archive.file(p, {name: pp.base})
        });

        // collect level directories
        for (let i = 1; fs.existsSync(i.toString()); i++) {
            const p = i.toString();
            if (fs.existsSync(p)) {
            console.log('Add dir', p, p)
                archive.directory(path.resolve( p), p, {});
            }
        }

        archive.finalize();
    }
    console.log("finished");
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
