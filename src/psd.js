const {RandomAccessFile} = require('./randomaccessfile');
const EventEmitter = require('events');
const packbits = require('@fiahfy/packbits');

module.exports.PSD = class PSD extends EventEmitter {
    _lines = [];
    _width;
    _height;
    _channels;
    _backgroundColor = {r: 0, g: 0, b: 0, a: 0}

    constructor(path) {
        super();
    }

    get backgroundColor() {
        return this._backgroundColor;
    }

    set backgroundColor(value) {
        this._backgroundColor = value;
    }

    get width() {
        return this._width;
    }

    get height() {
        return this._height;
    }

    getPixel(x, y) {
        if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
            return this._backgroundColor;
        } else {
            return {
                r: this._lines[y][x],
                g: this._lines[y + this._height][x],
                b: this._lines[y + this._height + this._height][x],
                a: 255
            }
        }
    }

    async load(path) {
        return new Promise(async (resolve, reject) => {
            let buf;
            let offset = 0;

            const fileSize = RandomAccessFile.fileSize(path);
            console.log('fileSize', fileSize);

            const fd = await RandomAccessFile.open(path);

            // File Header
            buf = await RandomAccessFile.read(fd, offset, 26);
            offset += 26;
            console.log('Signature', buf.toString('UTF-8', 0, 3));
            let version = buf.readUInt16BE(4); // PSD: 1; PSB: 2
            console.log('Version', version);
            this._channels = buf.readUInt16BE(12);
            console.log('Channels', this._channels);
            this._height = buf.readUInt32BE(14);
            console.log('Height', this._height);
            this._width = buf.readUInt32BE(18);
            console.log('Width', this._width);
            console.log('Depth', buf.readUInt16BE(22));
            console.log('ColorMode', buf.readUInt16BE(24));

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
            if (compression === 0) {
                await this.readRAWData(buf, fd, offset);
            } else if (compression === 1) {
                await this.readRLEData(version, buf, fd, offset);
            }

            await RandomAccessFile.close(fd);

            resolve(true);
        });
    }

    async readRAWData(buf, fd, offset) {
        console.log('read RAW Data');
        this._lines = [];
        const lineCount = this.height * this._channels;
        this.emit('begin', lineCount);
        for (let x = 0; x < lineCount; ++x) {
            buf = await RandomAccessFile.read(fd, offset, this.width);
            this._lines.push(buf)
            offset += this.width;
            this.emit('progress', x);
        }
        this.emit('end');
    }

    async readRLEData(version, buf, fd, offset) {
        console.log('read RLE Data');
        this._lines = [];
        // line lengths
        const lineSizes = [];
        const lineCount = this._height * this._channels;
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
        console.log('Line SIzes', lineSizes);
        console.log('offset', offset);

        console.log('Read Image Data.');

        this.emit('begin', lineCount);
        for (let x = 0; x < lineCount; ++x) {
            // console.log(x, lineSizes[x])
            buf = await RandomAccessFile.read(fd, offset, lineSizes[x]);
            let l = packbits.decode(buf);
            this._lines.push(l)
            // console.log(`index:${x} length: ${l.length}`);
            offset += lineSizes[x];
            this.emit('progress', x);
        }
        this.emit('end');
    }
}
