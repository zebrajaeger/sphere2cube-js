const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const cliProgress = require('cli-progress');
const {convert, convert2, faces} = require('./convert');
const {PSD} = require('./psd');

const b1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

// const file = 'C:/temp/test.psd';
// const file = 'C:/temp/test_10k.psd';
const file = 'C:/prj.lars/sphere2cube/samples/test.psb';

let targetImgSize; // undefined means sour image width / 4
const previewX = 1000;
const backgroundColor = {r: 0, g: 255, b: 0, a: 20};
const tileSize = 512;

const namePostfix = {
    0: 'b',
    1: 'l',
    2: 'f',
    3: 'r',
    4: 'u',
    5: 'd',
}

async function renderPreview(psd, yOffset, previewWidth, background, targetPath) {
    return new Promise((resolve, reject) => {
        new Jimp(previewX,
            previewX * 3 / 4,
            Jimp.rgbaToInt(background.r, background.g, background.b, background.a, undefined),
            (err, image) => {
                if (err) {
                    reject(err);
                    return;
                }

                convert(psd.width,
                    previewWidth,
                    (x, y) => psd.getPixel(x, y - yOffset),
                    (x, y, color) => {
                        // console.log({color})
                        const px = Jimp.rgbaToInt(color.r, color.g, color.b, color.a, undefined);
                        image.setPixelColor(px, x, y);
                    }
                )

                image.write(targetPath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(image);
                    }
                });
            });
    });
}

function renderFace(psd, yOffset, face, outImgSize, background, targetPath) {
    return new Promise((resolve, reject) => {
        new Jimp(outImgSize,
            outImgSize,
            Jimp.rgbaToInt(background.r, background.g, background.b, background.a, undefined),
            (err, image) => {
                if (err) {
                    b1.increment();
                    reject(err);
                    return;
                }

                convert2(psd.width,
                    outImgSize,
                    face,
                    (x, y) => psd.getPixel(x, y - yOffset),
                    (x, y, color) => {
                        const px = Jimp.rgbaToInt(color.r, color.g, color.b, color.a, undefined);
                        image.setPixelColor(px, x, y);
                    }
                )

                if (targetPath) {
                    image.write(targetPath, (err) => {
                        b1.increment();
                        if (err) {
                            reject(err);
                        } else {
                            resolve(image);
                        }
                    });
                } else {
                    resolve(image);
                }
            })
    })
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
        await renderPreview(srcImage, yOff, previewX, backgroundColor, 'c:/temp/!panotest/test-preview.png');

        // render faces
        targetImgSize = targetImgSize || Math.floor(srcImage.width / 4);
        console.log(`Render sites (${targetImgSize}x${targetImgSize}):`)

        // b1.start(6, 0, {speed: "N/A"})

        const basePath = 'c:/temp/!panotest/';

        let maxLevelToRender = 0;
        for (let face = 0; face < 6; ++face) {
            const img = await renderFace(srcImage, yOff, face, targetImgSize, backgroundColor)
            const maxLevel = getMaxLevel(img.bitmap.width, img.bitmap.height, tileSize);
            maxLevelToRender = Math.max(maxLevelToRender, maxLevel);
            // create tiles
            for (let level = maxLevel; level >= 0; level--) {
                const levelPath = path.resolve(basePath, `${level + 1}`);
                fs.mkdirSync(levelPath, {recursive: true});
                console.log(`Render Level: ${level}`)
                const countX = Math.ceil(img.bitmap.height / tileSize);
                const countY = Math.ceil(img.bitmap.width / tileSize);
                for (let y = 0; y < countY; y++) {
                    for (let x = 0; x < countX; x++) {
                        const tilePath = path.resolve(levelPath, `${namePostfix[face]}${y}_${x}.png`);
                        await renderTile(img, face, level, x, y, tileSize, tilePath);
                    }
                }
                img.scale(0.5);
            }

            // b1.update(face + 1);
        }
        // b1.stop()

        // cubeResolution = edge of cube with max resoultion

        const html = `<!DOCTYPE HTML>
                        <html>
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Multiresolution panorama</title>
                            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
                            <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
                            <style>
                            #panorama {
                                width: 600px;
                                height: 400px;
                            }
                            </style>
                        </head>
                        <body>
                        
                        <div id="panorama"></div>
                        <script>
                        pannellum.viewer('panorama', {
                            "type": "multires",
                            "multiRes": {
                                "basePath": ".",
                                "path": "/%l/%s%y_%x",
                                "extension": "png",
                                "tileResolution": ${tileSize},
                                "maxLevel": ${maxLevelToRender + 1},
                                "cubeResolution": ${targetImgSize}
                            }, 
                            "autoLoad": true
                        });
                        </script>
                        
                        </body>
                        </html>`
        fs.writeFileSync('C://temp/!panotest/index.html', html);

        console.log("finished");
    }
)
();
