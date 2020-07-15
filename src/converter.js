const fs = require('fs');
const path = require('path');

const Jimp = require('jimp');
const cliProgress = require('cli-progress');
const {PSD} = require('./psd');
const pannellum = require('./pannellum');
const {FaceRenderer, PreviewRenderer} = require('./renderer');

const b1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

const faceName = {
    0: {filePrefix: 'b', name: 'Back'},
    1: {filePrefix: 'l', name: 'Left'},
    2: {filePrefix: 'f', name: 'Front'},
    3: {filePrefix: 'r', name: 'Right'},
    4: {filePrefix: 'u', name: 'Top'},
    5: {filePrefix: 'd', name: 'Bottom'}
};

module.exports.renderPano = renderPano;

async function renderPano(sourcePath, targetFolder, config) {
    // load source
    const srcImage = new PSD();
    srcImage.on('begin', lineCount => b1.start(lineCount - 1, 0, {speed: "N/A"}));
    srcImage.on('progress', line => b1.update(line));
    srcImage.on('end', () => b1.stop())
    await srcImage.load(sourcePath);

    // offset foy y-center pos
    const yOff = Math.floor(((srcImage.width / 2) - srcImage.height) / 2);
    console.log({yOff})

    // render preview
    console.log(`Render preview(${config.previewWidth}x${config.previewWidth * 3 / 4}):`)
    const previewRenderer = new PreviewRenderer(srcImage, yOff);
    await previewRenderer.render(config.previewWidth, config.backgroundColor, path.resolve(targetFolder, 'test-preview.png'));

    // render faces
    const targetImageSize = config.targetImgSize || Math.floor(srcImage.width / 4);
    console.log(`Render sites (${targetImageSize}x${targetImageSize}):`)


    // create tiles
    const faceRenderer = new FaceRenderer(srcImage, yOff);
    let maxLevelToRender = 0;
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
                    await renderTile(img, face, level, x, y, config.tileSize, tilePath);
                    b1.update((y * countX) + x + 1);
                }
            }
            b1.stop()

            img.scale(0.5);
        }
    }

    fs.writeFileSync(
        path.resolve(targetFolder, 'index.html'),
        pannellum.createHtml({tileSize: config.tileSize, maxLevelToRender, targetImgSize: config.targetImgSize}));

    console.log("finished");
}

function renderTile(sourceImage, face, level, xOffset, yOffset, tileSize, path) {
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
                image.write(path, err => {
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
