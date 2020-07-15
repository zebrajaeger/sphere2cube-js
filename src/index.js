const fs = require('fs');
const packbits = require('@fiahfy/packbits');
const Jimp = require('jimp');
const {convert, convert2, faces} = require('./convert');
const {RandomAccessFile} = require('./randomaccessfile');
const cliProgress = require('cli-progress');


const b1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)

// const file = 'C:/temp/test.psd';
// const file = 'C:/temp/test_10k.psd';
const file = 'C:/prj.lars/sphere2cube/samples/test.psb';

let outImgSize; // undefined means sour image width / 4
const previewX = 1000;
const backgroundColor = {r: 0, g: 255, b: 0, a: 0};

(async () => {
        let buf;
        let offset = 0;

        const fileSize = RandomAccessFile.fileSize(file);
        console.log('fileSize', fileSize);

        const fd = await RandomAccessFile.open(file);

        // File Header
        buf = await RandomAccessFile.read(fd, offset, 26);
        offset += 26;
        console.log('Signature', buf.toString('UTF-8', 0, 3));
        let version = buf.readUInt16BE(4); // PSD: 1; PSB: 2
        console.log('Version', version);
        let channels = buf.readUInt16BE(12);
        console.log('Channels', channels);
        let height = buf.readUInt32BE(14);
        console.log('Height', height);
        let width = buf.readUInt32BE(18);
        console.log('Width', width);
        console.log('Depth', buf.readUInt16BE(22));
        console.log('ColorMode', buf.readUInt16BE(24));

        outImgSize = outImgSize || Math.floor(width / 4);
        // Color Mode Data
        buf = await RandomAccessFile.read(fd, offset, 4);
        offset += 4;
        let colorModeLength = buf.readUInt32BE(0);
        console.log('Color Mode Data length', colorModeLength);
        offset += colorModeLength;

        // Image Resources
        buf = await RandomAccessFile.read(fd, offset, 4);
        offset += 4;
        let imageResourceLength = buf.readUInt32BE(0);
        console.log('Image Resources length', imageResourceLength);
        offset += imageResourceLength;

        // Layer and Mask Information
        let layerAndMaskInformationLength;
        if (version === 1) {
            buf = await RandomAccessFile.read(fd, offset, 4);
            offset += 4;
            layerAndMaskInformationLength = buf.readUInt32BE(0);
        } else {
            buf = await RandomAccessFile.read(fd, offset, 8);
            offset += 8;
            layerAndMaskInformationLength = (buf.readUInt32BE(0) * Math.pow(2, 32)) + buf.readUInt32BE(4);
        }
        console.log('Layer and Mask Information length', layerAndMaskInformationLength);

        // Image Data
        //  type    0:raw, 1:rle
        buf = await RandomAccessFile.read(fd, offset, 2);
        offset += 2;
        let compression = buf.readUInt16BE(0);
        console.log('Compression', compression);

        // line legths
        const lineSizes = [];
        const lineCount = height * channels;
        console.log('lineCount', lineCount);
        if (version === 1) {
            buf = await RandomAccessFile.read(fd, offset, (lineCount * 2));
            offset += (lineCount * 2);
            console.log('lineSizes size', buf.length)
            for (let i = 0; i < lineCount; ++i) {
                lineSizes.push(buf.readUInt16BE(i << 1));
            }
        } else if (version === 2) {
            buf = await RandomAccessFile.read(fd, offset, (lineCount * 4));
            offset += (lineCount * 4);
            console.log('lineSizes size', buf.length)
            for (let i = 0; i < lineCount; ++i) {
                lineSizes.push(buf.readUInt32BE(i << 2));
            }
        }
        // console.log('Line SIzes', lineSizes);
        console.log('offset', offset);

        console.log('Read Image Data.');
        b1.start(lineCount, 0, {
            speed: "N/A"
        });

        const lines = [];
        for (let x = 0; x < lineCount; ++x) {
            // console.log(x, lineSizes[x])
            buf = await RandomAccessFile.read(fd, offset, lineSizes[x]);
            let l = packbits.decode(buf);
            lines.push(l)
            // console.log(`index:${x} length: ${l.length}`);
            offset += lineSizes[x];
            b1.increment();
        }
        b1.stop();

        const yOff = Math.floor(((width / 2) - height) / 2);
        console.log({yOff})
        const getPixel = (x, y) => {
            y -= yOff;
            if (x < 0 || x >= width || y < 0 || y >= height) {
                return backgroundColor;
            } else {
                return {
                    r: lines[y][x], g: lines[y + height][x], b: lines[y + height + height][x], a: 255
                }
            }
        }

        console.log(`Render preview(${previewX}x${previewX * 3 / 4}):`)
        await new Promise((resolve, reject) => {
            new Jimp(previewX,
                previewX * 3 / 4,
                Jimp.rgbaToInt(backgroundColor.r, backgroundColor.g, backgroundColor.b, backgroundColor.a, undefined),
                (err, image) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    convert(width, previewX, getPixel, (x, y, color) => {
                            const px = Jimp.rgbaToInt(color.r, color.g, color.b, color.a, undefined);
                            image.setPixelColor(px, x, y);
                        }
                    )
                    image.write('c:/temp/test-preview.png', (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(image);
                        }
                    });
                });
        });

        const namePostfix = {
            0: 'Back',
            1: 'Left',
            2: 'Front',
            3: 'Right',
            4: 'Top',
            5: 'Bottom',
        }

        console.log(`Render sites (${outImgSize}x${outImgSize}):`)
        b1.start(6, 0, {
            speed: "N/A"
        });
        for (let i = 0; i < 6; ++i) {
            await new Promise((resolve, reject) => {
                new Jimp(outImgSize,
                    outImgSize,
                    Jimp.rgbaToInt(backgroundColor.r, backgroundColor.g, backgroundColor.b, backgroundColor.a, undefined),
                    (err, image) => {
                        if (err) {
                            b1.increment();
                            reject(err);
                            return;
                        }
                        convert2(width, outImgSize, faces.back, getPixel, (x, y, color) => {
                                const px = Jimp.rgbaToInt(color.r, color.g, color.b, color.a, undefined);
                                image.setPixelColor(px, x, y);
                            }
                        )
                        image.write(`c:/temp/test-${namePostfix[i]}.png`, (err) => {
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

        b1.stop();
        console.log("finished");
    }
)();
