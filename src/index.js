const Jimp = require('jimp');
const cliProgress = require('cli-progress');
const {convert, convert2, faces} = require('./convert');
const {PSD} = require('./psd');

const b1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

const file = 'C:/temp/test.psd';
// const file = 'C:/temp/test_10k.psd';
// const file = 'C:/prj.lars/sphere2cube/samples/test.psb';

let targetImgSize; // undefined means sour image width / 4
const previewX = 1000;
const backgroundColor = {r: 0, g: 255, b: 0, a: 0};

const namePostfix = {
    0: 'Back',
    1: 'Left',
    2: 'Front',
    3: 'Right',
    4: 'Top',
    5: 'Bottom',
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
                image.write(targetPath, (err) => {
                    b1.increment();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(image);
                    }
                });
            })
    })
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
        await renderPreview(srcImage, yOff, previewX, backgroundColor, 'c:/temp/test-preview.png');

        // render faces
        targetImgSize = targetImgSize || Math.floor(srcImage.width / 4);
        console.log(`Render sites (${targetImgSize}x${targetImgSize}):`)
        b1.start(6, 0, {speed: "N/A"})
        for (let i = 0; i < 6; ++i) {
            await renderFace(srcImage, yOff, i, targetImgSize, backgroundColor, `c:/temp/test-${namePostfix[i]}.png`)
            b1.update(i+1);
        }
        b1.stop()

        console.log("finished");
    }
)
();
