const fs = require('fs');
const path = require('path');

const Jimp = require('jimp');
const cliProgress = require('cli-progress');
const {PSD} = require('./psd');
const {JPG} = require('./jpg');
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

    faceName = faceName || defaultFaceName;

    console.log({sourcePath});

    // load Source Image
    if (sourcePath.toLowerCase().endsWith('.psd') || sourcePath.toLowerCase().endsWith('.psb')) {
        srcImage = new PSD();
        srcImage.on('begin', lineCount => b1.start(lineCount - 1, 0, {speed: "N/A"}));
        srcImage.on('progress', line => b1.update(line));
        srcImage.on('end', () => b1.stop())
        await srcImage.load(sourcePath);
    } else if (sourcePath.toLowerCase().endsWith('.jpg') || sourcePath.toLowerCase().endsWith('.jpeg')
        || sourcePath.toLowerCase().endsWith('.gif')
        || sourcePath.toLowerCase().endsWith('.bmp')
        || sourcePath.toLowerCase().endsWith('.tiff')) {
        srcImage = new JPG(sourcePath);
        await srcImage.load(sourcePath);
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
        // render preview
        console.log(`Render preview(${config.previewWidth}x${config.previewWidth * 3 / 4}):`)
        const previewRenderer = new PreviewRenderer(srcImage, xOff, yOff);
        await previewRenderer.render(config.previewWidth, config.backgroundColor, config.previewQuality, path.resolve(targetFolder, config.previewPath));
    }

    let maxLevelToRender = 0;
    const targetImageSize = config.targetImgSize || Math.floor(srcImage.width / 4);
    if (!config.tilesIgnore) {
        // render faces
        console.log(`Render sites (${targetImageSize}x${targetImageSize}):`)

        // create tiles
        const faceRenderer = new FaceRenderer(srcImage, xOff, yOff);
        for (let face = 0; face < 6; ++face) {
            console.log(`Render Face (${face + 1}/6) ${faceName[face].name}...`)
            faceRenderer.on('begin', count => b1.start(count - 1, 0, {speed: "N/A"}));
            faceRenderer.on('progress', v => b1.update(v));
            faceRenderer.on('end', () => b1.stop())
            const img = await faceRenderer.render(face, targetImageSize, config.backgroundColor);
            console.log(`...done`)

            const maxLevel = getMaxLevel(img.bitmap.width, img.bitmap.height, config.tileSize);
            maxLevelToRender = Math.max(maxLevelToRender, maxLevel);

            for (let level = maxLevel; level >= 0; level--) {
                const levelPath = path.resolve(targetFolder, `${level + 1}`);
                fs.mkdirSync(levelPath, {recursive: true});
                console.log(`  Render Level: ${level}`)
                const countX = Math.ceil(img.bitmap.height / config.tileSize);
                const countY = Math.ceil(img.bitmap.width / config.tileSize);

                const imgCount = countX * countY;
                b1.start(imgCount, 0, {speed: "N/A"})
                for (let y = 0; y < countY; y++) {
                    for (let x = 0; x < countX; x++) {
                        const tilePath = path.resolve(levelPath, `${faceName[face].filePrefix}${y}_${x}.png`);
                        await renderTile(img, face, level, x, y, config.tileSize, config.tileQuality, tilePath);
                        b1.update((y * countX) + x + 1);
                    }
                }
                b1.stop()

                img.scale(0.5);
            }
        }
    }

    if (!config.htmlIgnore) {
        const html = pannellum.createHtml({tileSize: config.tileSize, maxLevelToRender, targetImageSize});
        fs.writeFileSync(path.resolve(targetFolder, 'index.html'), html)
    }

    console.log("finished");
}

function renderTile(sourceImage, face, level, xOffset, yOffset, tileSize, tileQuality, path) {
    return new Promise((resolve, reject) => {
        let offX = xOffset * tileSize;
        let offY = yOffset * tileSize;
        let imgX = Math.min(tileSize, sourceImage.bitmap.width - offX);
        let imgY = Math.min(tileSize, sourceImage.bitmap.height - offY);
        new Jimp(imgX,
            imgY,
            (err, image) => {
                for (let y = 0; y < imgY; ++y) {
                    for (let x = 0; x < imgX; ++x) {
                        const col = sourceImage.getPixelColor(offX + x, offY + y);
                        image.setPixelColor(col, x, y);
                    }
                }
                image.quality(tileQuality).write(path, err => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(image);
                    }
                });
            })
    })
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
