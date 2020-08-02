const fs = require('fs');
const path = require('path');

const archiver = require('archiver');
const cliProgress = require('cli-progress');
const prettyBytes = require('pretty-bytes');
const twig = require('twig').twig;

const {PSD} = require('./psd');
const {IMG,BigIMG} = require('./img');
const {Bilinear} = require('./scale');
const pannellum = require('./pannellum');
const marzipano = require('./marzipano');
const {FaceRenderer, PreviewRenderer} = require('./renderer');
const {Stopwatch} = require('./stopwatch');

const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_grey)

const defaultFaceNames = {
    0: {filePrefix: 'b', index: 0, name: 'Back'},
    1: {filePrefix: 'l', index: 1, name: 'Left'},
    2: {filePrefix: 'f', index: 2, name: 'Front'},
    3: {filePrefix: 'r', index: 3, name: 'Right'},
    4: {filePrefix: 'u', index: 4, name: 'Top'},
    5: {filePrefix: 'd', index: 5, name: 'Bottom'},
    'b': {filePrefix: 'b', index: 0, name: 'Back'},
    'l': {filePrefix: 'l', index: 1, name: 'Left'},
    'f': {filePrefix: 'f', index: 2, name: 'Front'},
    'r': {filePrefix: 'r', index: 3, name: 'Right'},
    'u': {filePrefix: 'u', index: 4, name: 'Top'},
    'd': {filePrefix: 'd', index: 5, name: 'Bottom'},
};

module.exports.renderPano = renderPano;

async function renderPano(config) {
    const zipSource = {files: [], folders: []};

    const overallStopwatch = new Stopwatch().begin();

    // faceNames = faceNames || defaultFaceNames;

    console.log(config.sourceImage.toLowerCase().endsWith('.psd') || config.sourceImage.toLowerCase().endsWith('.psb'));

    // load Source Image
    const swImg = new Stopwatch().begin();
    let srcImage;
    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log(`| Load Image '${config.sourceImage}'`);
    console.log('+------------------------------------------------------------------------')
    if (config.sourceImage.toLowerCase().endsWith('.psd') || config.sourceImage.toLowerCase().endsWith('.psb')) {
        srcImage = new PSD();
        srcImage.on('begin', lineCount => progressBar.start(lineCount - 1, 0, {speed: "N/A"}));
        srcImage.on('progress', line => progressBar.update(line));
        srcImage.on('end', () => progressBar.stop())
        if (config.previewIgnore && config.tilesIgnore && !config.renderCube) {
            await srcImage.loadHeaderOnly(config.sourceImage);
        } else {
            await srcImage.load(config.sourceImage);
        }
    } else {
        srcImage = new IMG();
        if (!await srcImage.load(config.sourceImage)) {
            throw 'Unsupported image file type'
        }
    }
    console.log(`Image loaded in ${swImg.getTimeString()}`)

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
    const previewCubedPath = getPathAndCreateDir(config.targetFolder, config.previewCubePath);
    zipSource.files.push(previewCubedPath);
    const previewScaledPath = getPathAndCreateDir(config.targetFolder, config.previewScaledPath);
    zipSource.files.push(previewScaledPath);

    if (!config.previewIgnore) {
        previewCube(config, srcImage, outerWidth, xOff, yOff, previewCubedPath);
        previewScaled(srcImage, config, previewScaledPath);
    }

    // Level Data
    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log('| Level Data')
    console.log('+------------------------------------------------------------------------')

    const targetImageSize = calculateTargetImageSize(config.targetImgSize || Math.floor(srcImage.width / 4), config.tileSize);
    console.log({targetImageSize});
    let levels = calculateLevels(targetImageSize, config.tileSize);
    // TODO levels may not the first part of path
    for (let i = 1; i <= levels.levelCount; ++i) {
        const folderPath = path.resolve(config.targetFolder, i.toString());
        zipSource.folders.push(folderPath);
    }
    console.log(JSON.stringify(levels, null, 2))

    // Tiles
    await tiles(srcImage, outerWidth, xOff, yOff, defaultFaceNames, targetImageSize, config, levels);

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
        pannellumPath: getPathAndCreateDir(config.targetFolder, config.htmlPannellumFile),
        marzipanoPath: getPathAndCreateDir(config.targetFolder, config.htmlMarzipanoFile)
    };
    console.log(JSON.stringify(data, null, 2))
    zipSource.files.push(data.pannellumPath);
    zipSource.files.push(data.marzipanoPath);
    if (!config.htmlIgnore) {
        html(config, data);
    }

    // Zip
    if (!config.zipIgnore) {
        await zip(config, zipSource);
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

function zip(config, zipSource) {
    return new Promise((resolve, reject) => {
        const sw = new Stopwatch().begin();

        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log('| ZIP')
        console.log('+------------------------------------------------------------------------')
        console.log(zipSource)
        let progress = false;

        // zip stream
        const zipFilePath = getPathAndCreateDir(config.targetFolder, config.zipPath);
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

async function tiles(srcImage, w, xOff, yOff, faceNames, targetImageSize, config, levels) {
    const swAll = new Stopwatch().begin();

    // load Signature Image
    let signatureImage;
    if (config.signaturImagePath && config.signaturSide.length > 0) {
        console.log(`Load signature image: '${config.signaturImagePath}'`)
        signatureImage = new IMG();
        await signatureImage.load(config.signaturImagePath);
    }

    // faces to render
    for (const f of config.facesToRender) {
        const swFace = new Stopwatch().begin();

        const face = defaultFaceNames[f];
        console.log()
        console.log('+------------------------------------------------------------------------')
        console.log(`| Render Face Tiles '${face.name}' (${targetImageSize}x${targetImageSize})px² (${face.index + 1}/6)`)
        console.log('+------------------------------------------------------------------------')

        const faceRenderer = new FaceRenderer(srcImage, w, xOff, yOff);
        console.log('Render Face');
        faceRenderer.on('begin', count => progressBar.start(count - 1, 0, {speed: "N/A"}));
        faceRenderer.on('progress', v => progressBar.update(v));
        faceRenderer.on('end', () => progressBar.stop())
        let faceImg = faceRenderer.render(face.index, targetImageSize);
        console.log(`Face rendered ${swFace.getTimeString()}`);
        console.log();

        // Set signature image
        if (signatureImage && config.signaturSide.indexOf(f) !== -1) {
            console.log(`Set signature image ${swFace.getTimeString()}`);
            console.log();
            const offX = (targetImageSize - signatureImage.width) / 2;
            const offY = (targetImageSize - signatureImage.height) / 2;
            for (let y = 0; y < signatureImage.height; ++y) {
                for (let x = 0; x < signatureImage.width; ++x) {

                    // https://de.wikipedia.org/wiki/Alpha_Blending
                    let A = signatureImage.getPixel(x, y);
                    let B = faceImg.getPixel(x + offX, y + offY);
                    if (config.signaturBelow) {
                        let x = A;
                        A = B;
                        B = x;
                    }

                    const a_A = A.a / 255;
                    const a_NA = 1 - a_A;
                    const b_A = B.a / 255;
                    const a_C = a_A + (a_NA * b_A);
                    const pixel = {
                        r: ((B.r * a_NA * b_A) + (A.r * a_A)) / a_C,
                        g: ((B.g * a_NA * b_A) + (A.g * a_A)) / a_C,
                        b: ((B.b * a_NA * b_A) + (A.b * a_A)) / a_C,
                        a: a_C
                    }

                    faceImg.setPixel(x + offX, y + offY, pixel);
                }
            }
        }

        // Save cube face
        if (config.renderCube) {
            const cubePathTemplate = twig({data: config.cubePath});
            const facePath = cubePathTemplate.render({face: f})
            const absFacePath = getPathAndCreateDir(config.targetFolder, facePath)
            console.log(`Render cube side to '${absFacePath}'`);

            faceImg.write(absFacePath, {jpgQuality: config.cubeJpgQuality});
        }

        // create and store tiles
        if (!config.tilesIgnore) {
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
                            face: face.filePrefix,
                            fileType: config.tileFileType,
                            x, y
                        })
                        const tile = createTile(faceImg, x, y, config.tileSize);
                        tile.write(getPathAndCreateDir(config.targetFolder, tilePath), {jpgQuality: config.tileJpgQuality});
                        progressBar.update((y * countX) + x + 1);
                    }
                }
                progressBar.stop()

                // TODO for HQ: double scale by Math.sqr(2) instead of 0.5
                faceImg = faceImg.newScaledByFactor(0.5);
            }
            console.log(`Face tiles created in ${swFace.getTimeString()}`);
        }
    }

    console.log(`All tiles created in ${swAll.getTimeString()}`);
}

function previewCube(config, srcImage, outerWidth, xOff, yOff, previewCubedPath) {
    const sw = new Stopwatch().begin();

    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log(`| Render cubic preview(${config.previewWidth}x${config.previewWidth * 3 / 4}; xOff: ${xOff}, yOff:${yOff})`)
    console.log('+------------------------------------------------------------------------')

    const previewRenderer = new PreviewRenderer(srcImage, outerWidth, xOff, yOff);
    const previewImage = previewRenderer.render(config.previewWidth);

    previewImage.write(previewCubedPath, {jpgQuality: config.previewCubeJpgQuality});

    console.log(`Cubic preview generated in ${sw.getTimeString()}`);
}

function previewScaled(srcImage, config, targetPath) {
    const sw = new Stopwatch().begin();

    console.log()
    console.log('+------------------------------------------------------------------------')
    console.log('| Render scaled preview');
    console.log('+------------------------------------------------------------------------')
    let previewImage = srcImage;
    const pMax = 1000;
    const f = config.previewScaledFactor;

    let w = previewImage.width;
    let h = previewImage.height;
    for (; ;) {
        const toScale = Math.max(previewImage.width / pMax, previewImage.height / pMax);
        let n = Math.min(f, toScale);
        console.log('Downscale for Preview', {toScale, n})
        if (n === 1) {
            previewImage.toIMG().write(targetPath, {jpgQuality: config.previewScaledJpgQuality});
            break;
        }

        const tempImg = new BigIMG().create(Math.round(w / n), Math.round(h / n));

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
        w /= n;
        h /= n;
        previewImage = tempImg;
    }

    console.log(`Scaled preview generated in ${sw.getTimeString()}`);
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

function showMemoryUsage() {
    const used = process.memoryUsage();
    let res = [];
    for (let key in used) {
        res.push(`${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
    }
    console.log(res.join(' / '))
}
