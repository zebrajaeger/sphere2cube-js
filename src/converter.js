const fs = require('fs');
const path = require('path');

const archiver = require('archiver');
const cliProgress = require('cli-progress');
const prettyBytes = require('pretty-bytes');
const twig = require('twig').twig;

const {PSD} = require('./psd');
const {IMG} = require('./img');
const {Bilinear} = require('./scale');
const pannellum = require('./pannellum');
const marzipano = require('./marzipano');
const {FaceRenderer, PreviewRenderer} = require('./renderer');
const {Stopwatch} = require('./stopwatch');

const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_grey)

module.exports.defaultFaceNames = defaultFaceNames = {
    0: {filePrefix: 'b', name: 'Back'},
    1: {filePrefix: 'l', name: 'Left'},
    2: {filePrefix: 'f', name: 'Front'},
    3: {filePrefix: 'r', name: 'Right'},
    4: {filePrefix: 'u', name: 'Top'},
    5: {filePrefix: 'd', name: 'Bottom'}
};

module.exports.renderPano = renderPano;

async function renderPano(sourcePath, targetFolder, config, faceNames) {
    // let t = twig({data:'aaa{{foo}}bbb'})
    // console.log(t.render({foo:'bar'}));
    // return;
    const zipSource = {files: [], folders: []};

    const overallStopwatch = new Stopwatch().begin();

    faceNames = faceNames || defaultFaceNames;

    console.log({sourcePath}, sourcePath.toLowerCase().endsWith('.psd') || sourcePath.toLowerCase().endsWith('.psb'));

    // load Source Image
    let srcImage;
    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log('| Load Image');
    console.log('+------------------------------------------------------------------------')
    if (sourcePath.toLowerCase().endsWith('.psd') || sourcePath.toLowerCase().endsWith('.psb')) {
        srcImage = new PSD();
        srcImage.on('begin', lineCount => progressBar.start(lineCount - 1, 0, {speed: "N/A"}));
        srcImage.on('progress', line => progressBar.update(line));
        srcImage.on('end', () => progressBar.stop())
        if (config.previewIgnore && config.tilesIgnore) {
            await srcImage.loadHeaderOnly(sourcePath);
        } else {
            await srcImage.load(sourcePath);
        }
    } else {
        srcImage = new IMG();
        if (!await srcImage.load(sourcePath)) {
            throw 'Unsupported image file type'
        }
    }

    // Equirectangular outer bound
    const outerWidth = config.panoAngle === 360 ? srcImage.width : Math.floor(srcImage.width * 360 / config.panoAngle);
    const outerHeight = Math.floor(outerWidth / 2);
    console.log({angel: config.panoAngle})

    // offset foy y-center pos
    const yShift = Math.floor(outerHeight * config.panoYOffset / 180);
    const yOff = Math.floor((outerHeight - srcImage.height) / 2) - yShift;
    const xOff = Math.floor((outerWidth - srcImage.width) / 2);
    console.log({outerWidth, outerHeight, srcImageWidth: srcImage.width, srcImageHeight: srcImage.height})
    console.log({xOff, yOff})

    // Preview
    const previewCubedPath = getPathAndCreateDir(targetFolder, config.previewCubePath);
    zipSource.files.push(previewCubedPath);
    const previewScaledPath = getPathAndCreateDir(targetFolder, config.previewScaledPath);
    zipSource.files.push(previewScaledPath);

    if (!config.previewIgnore) {
        previewCube(config, srcImage, outerWidth, xOff, yOff, previewCubedPath);
        previewScaled(srcImage, config, previewScaledPath);
    }

    // Tiles
    const targetImageSize = calculateTargetImageSize(config.targetImgSize || Math.floor(srcImage.width / 4), config.tileSize);
    console.log({targetImageSize});
    let levels = calculateLevels(targetImageSize, config.tileSize);
    // TODO levels may not the first part of path
    for (let i = 1; i <= levels.levelCount; ++i) {
        const folderPath = path.resolve(targetFolder, i.toString());
        zipSource.folders.push(folderPath);
    }
    console.log(JSON.stringify(levels, null, 2))
    if (!config.tilesIgnore) {
        tiles(srcImage, outerWidth, xOff, yOff, faceNames, targetImageSize, config, levels, targetFolder);
    }

    // Html
    const hAngel = srcImage.height * 180 / outerHeight
    const area = {
        x: {min: config.panoAngle / -2, max: config.panoAngle / 2},
        y: {min: (hAngel / -2) + config.panoYOffset, max: (hAngel / 2) + config.panoYOffset}
    }
    let data = {
        autoLoad: true,
        levels,
        targetImageSize,
        area,
        pannellumPath: getPathAndCreateDir(targetFolder, config.htmlPannellumFile),
        marzipanoPath: getPathAndCreateDir(targetFolder, config.htmlMarzipanoFile)
    };
    console.log(JSON.stringify(data, null, 2))
    zipSource.files.push(data.pannellumPath);
    zipSource.files.push(data.marzipanoPath);
    if (!config.htmlIgnore) {
        html(config, data);
    }

    // Zip
    if (!config.zipIgnore) {
        await zip(config, zipSource, targetFolder);
    }

    console.log();
    console.log('+------------------------------------------------------------------------')
    console.log(`| finished in ${overallStopwatch.getTimeString()}`);
    console.log('+------------------------------------------------------------------------')
}

function calculateTargetImageSize(minSize, tileSize) {

    let result = 0;
    for (let e = 0; result < minSize; ++e) {
        result = Math.pow(2, e) * tileSize;
    }
    return result;
}

function zip(config, zipSource, targetFolder) {
    return new Promise((resolve, reject) => {
        const sw = new Stopwatch().begin();

        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log('| ZIP')
        console.log('+------------------------------------------------------------------------')
        console.log(zipSource)
        let progress = false;

        // zip stream
        const zipFilePath = getPathAndCreateDir(targetFolder, config.zipPath);
        let zipStream = fs.createWriteStream(zipFilePath);
        zipStream.on('close', () => {
            console.log(`File Size: ${prettyBytes(archive.pointer())}`);
            resolve();
            console.log(`Zipped in ${sw.getTimeString()}`)
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

        // archive
        let archive = archiver('zip', {
            zlib: {level: 9} // Sets the compression level.
        });
        archive.on('progress', function (progressData) {
            if (!progress) {
                progressBar.start(progressData.entries.total, progressData.entries.processed);
                progress = true;
            } else {
                progressBar.update(progressData.entries.processed);
                if (progressData.entries.total === progressData.entries.processed) {
                    progressBar.stop()
                }
            }
        });
        archive.pipe(zipStream);

        // add files
        zipSource.files.forEach(file => {
            const name = path.parse(file).base;
            console.log(`Add file '${file}' as  '${name}'`)
            archive.file(file, {name})
        });

        // add folders
        zipSource.folders.forEach(folder => {
            const name = path.parse(folder).base;
            console.log(`Add folder '${folder}' as  '${name}'`)
            archive.directory(folder, name, {});
        });

        archive.finalize();
    });
}

function html(config, data) {
    const sw = new Stopwatch().begin();

    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log('| Render Html')
    console.log('+------------------------------------------------------------------------')

    fs.writeFileSync(data.pannellumPath, pannellum.createHtml(config, data))
    fs.writeFileSync(data.marzipanoPath, marzipano.createHtml(config, data))

    console.log(`Html generated in ${sw.getTimeString()}`);
}

function tiles(srcImage, w, xOff, yOff, faceNames, targetImageSize, config, levels, targetFolder) {
    const swAll = new Stopwatch().begin();

    const faceRenderer = new FaceRenderer(srcImage, w, xOff, yOff);
    for (let face = 0; face < 6; ++face) {
        const swFace = new Stopwatch().begin();
        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log(`| Render Face Tiles ${faceNames[face].name} (${targetImageSize}x${targetImageSize})px² (${face + 1}/6)`)
        console.log('+------------------------------------------------------------------------')

        console.log('Render Face');
        faceRenderer.on('begin', count => progressBar.start(count - 1, 0, {speed: "N/A"}));
        faceRenderer.on('progress', v => progressBar.update(v));
        faceRenderer.on('end', () => progressBar.stop())
        let faceImg = faceRenderer.render(face, targetImageSize);
        console.log(`Face rendered ${swFace.getTimeString()}`);
        console.log();
        console.log('Create Tiles');
        swFace.begin();
        const tilePathTemplate = twig({data: config.tilePathTemplate});
        for (let level = levels.levelCount; level > 0; level--) {
            console.log(`  Render Level: ${level}`)
            const countX = Math.ceil(faceImg.height / config.tileSize);
            const countY = Math.ceil(faceImg.width / config.tileSize);

            const imgCount = countX * countY;
            progressBar.start(imgCount, 0, {speed: "N/A"})
            for (let y = 0; y < countY; y++) {
                for (let x = 0; x < countX; x++) {

                    let tilePath = tilePathTemplate.render({
                        levelCount: level,
                        levelIndex: level - 1,
                        face: faceNames[face].filePrefix,
                        fileType: config.tileFileType,
                        x, y
                    })
                    const tile = createTile(faceImg, x, y, config.tileSize);
                    tile.write(getPathAndCreateDir(targetFolder, tilePath), {jpgQuality: config.tileJpgQuality});
                    progressBar.update((y * countX) + x + 1);
                }
            }
            progressBar.stop()

            faceImg = faceImg.newScaledByFactor(0.5);
        }
        console.log(`Face tiles created in ${swFace.getTimeString()}`);
    }

    console.log(`All tiles created in ${swAll.getTimeString()}`);
}

function previewCube(config, srcImage, outerWidth, xOff, yOff, targetPath) {
    const sw = new Stopwatch().begin();

    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log(`| Render cubic preview(${config.previewWidth}x${config.previewWidth * 3 / 4}; xOff: ${xOff}, yOff:${yOff})`)
    console.log('+------------------------------------------------------------------------')

    const previewRenderer = new PreviewRenderer(srcImage, outerWidth, xOff, yOff);
    const previewImage = previewRenderer.render(config.previewWidth);

    previewImage.write(targetPath, {jpgQuality: config.previewCubeJpgQuality});

    console.log(`Scaled preview generated in ${sw.getTimeString()}`);
}

function previewScaled(srcImage, config, targetPath) {
    const sw = new Stopwatch().begin();

    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log('| Render scaled preview');
    console.log('+------------------------------------------------------------------------')
    let previewImage = srcImage;
    const pMax = 1000;
    const f = Math.sqrt(2);

    for (; ;) {
        const toScale = Math.max(previewImage.width / pMax, previewImage.height / pMax);
        let n = Math.min(f, toScale);
        console.log('Downscale for Preview', {toScale, n})
        if (n === 1) {
            previewImage.write(targetPath, {jpgQuality: config.previewScaledJpgQuality});
            break;
        }

        const tempImg = new IMG();
        tempImg.create(previewImage.width / n, previewImage.height / n);

        const bilinear = new Bilinear();
        bilinear.on('begin', lineCount => progressBar.start(lineCount - 1, 0, {speed: "N/A"}));
        bilinear.on('progress', line => progressBar.update(line));
        bilinear.on('end', () => progressBar.stop())
        bilinear.scale(
            {w: previewImage.width, h: previewImage.height},
            {w: tempImg.width, h: tempImg.height},
            (x, y) => {
                return previewImage.getPixel(x, y)
            },
            (x, y, pixel) => {
                tempImg.setPixel(x, y, pixel)
            });
        previewImage = tempImg;
    }

    console.log(`Cube preview generated in ${sw.getTimeString()}`);
}

function createTile(sourceImage, xOffset, yOffset, tileSize) {
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
    return tile;
}

function calculateLevels(imgSize, tileSize) {
    const result = {levels: []};
    let level = 0;
    while (imgSize >= tileSize) {
        result.levels.push({tileSize, size: imgSize});
        level++;
        imgSize = Math.round(imgSize * 0.5);
    }
    result.levels.reverse();
    level = 0;
    result.levels.forEach(l => {
        l.level = level++;
    })

    result.levelCount = level;
    return result;
}

function getPathAndCreateDir(targetFolder, filePath) {
    const absoluteFilePath = path.resolve(targetFolder, filePath);
    const filDir = path.dirname(absoluteFilePath);
    fs.mkdirSync(filDir, {recursive: true});
    return absoluteFilePath;
}

function showMemoryUsage(){
    const used = process.memoryUsage();
    let res = [];
    for (let key in used) {
        res.push( `${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
    }
    console.log(res.join(' / '))
}
