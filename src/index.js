
const fs = require('fs');
const path = require('path');

const Jimp = require('jimp');
const cliProgress = require('cli-progress');
const {convert, convert2, faces} = require('./convert');
const {PSD} = require('./psd');
const pannellum = require('./pannellum');
const {FaceRenderer, PreviewRenderer} = require('./renderer');

const b1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

// const file = 'C:/temp/test.psd';
const file = 'C:/temp/test_10k.psd';
// const file = 'C:/prj.lars/sphere2cube/samples/test.psb';
const basePath = 'c:/temp/!panotest/';

let targetImgSize; // undefined means sour image width / 4
const previewX = 1000;
const tileSize = 512;
const backgroundColor = {r: 0, g: 0, b: 0, a: 0};

const faceName = {
    0: {filePrefix: 'b', name: 'Back'},
    1: {filePrefix: 'l', name: 'Left'},
    2: {filePrefix: 'f', name: 'Front'},
    3: {filePrefix: 'r', name: 'Right'},
    4: {filePrefix: 'u', name: 'Top'},
    5: {filePrefix: 'd', name: 'Bottom'}
};

(async () => {
    // load source
    const srcImage = new PSD();
    srcImage.on('begin', lineCount => b1.start(lineCount - 1, 0, {speed: "N/A"}));
    srcImage.on('progress', line => b1.update(line));
    srcImage.on('end', () => b1.stop())
    await srcImage.load(file);

    // offset foy y-center pos
    const yOff = Math.floor(((srcImage.width / 2) - srcImage.height) / 2);
    console.log({yOff})

    // render preview
    console.log(`Render preview(${previewX}x${previewX * 3 / 4}):`)
    const previewRenderer = new PreviewRenderer(srcImage, yOff);
    await previewRenderer.render(previewX, backgroundColor, path.resolve(basePath, 'test-preview.png'));

    // render faces
    targetImgSize = targetImgSize || Math.floor(srcImage.width / 4);
    console.log(`Render sites (${targetImgSize}x${targetImgSize}):`)


    // create tiles
    const faceRenderer = new FaceRenderer(srcImage, yOff);
    let maxLevelToRender = 0;
    for (let face = 0; face < 6; ++face) {
        console.log(`Render Face (${face + 1}/6) ${faceName[face].name}...`)
        faceRenderer.on('begin', count => b1.start(count - 1, 0, {speed: "N/A"}));
        faceRenderer.on('progress', v => b1.update(v));
        faceRenderer.on('end', () => b1.stop())
        const img = await faceRenderer.render(face, targetImgSize, backgroundColor);
        console.log(`...done`)

        const maxLevel = getMaxLevel(img.bitmap.width, img.bitmap.height, tileSize);
        maxLevelToRender = Math.max(maxLevelToRender, maxLevel);

        for (let level = maxLevel; level >= 0; level--) {
            const levelPath = path.resolve(basePath, `${level + 1}`);
            fs.mkdirSync(levelPath, {recursive: true});
            console.log(`  Render Level: ${level}`)
            const countX = Math.ceil(img.bitmap.height / tileSize);
            const countY = Math.ceil(img.bitmap.width / tileSize);

            const imgCount = countX * countY;
            b1.start(imgCount, 0, {speed: "N/A"})
            for (let y = 0; y < countY; y++) {
                for (let x = 0; x < countX; x++) {
                    const tilePath = path.resolve(levelPath, `${faceName[face].filePrefix}${y}_${x}.png`);
                    await renderTile(img, face, level, x, y, tileSize, tilePath);
                    b1.update((y * countX) + x + 1);
                }
            }
            b1.stop()

            img.scale(0.5);
        }
    }

    fs.writeFileSync(
        path.resolve(basePath, 'index.html'),
        pannellum.createHtml({tileSize, maxLevelToRender, targetImgSize}));

    console.log("finished");
})();

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
