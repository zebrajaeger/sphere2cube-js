const {RandomAccessFile} = require('./randomaccessfile');
const EventEmitter = require('events');
const xml2js = require('xml2js');
const path = require("path");

const {StaticWorkerPool} = require('@zebrajaeger/threadpool');

module.exports.PSD = class PSD extends EventEmitter {
    _lines = [];
    _width;
    _height;
    _channels;
    _backgroundColor = {r: 0, g: 0, b: 0, a: 0}

    constructor() {
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
        // console.log(this._lines)
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

    async loadHeaderOnly(path) {
        return new Promise(async resolve => {
            let {fd} = await this.readHeader(path);
            await RandomAccessFile.close(fd);
            resolve(true);
        });
    }

    async load(path) {
        return new Promise(async resolve => {
            let {offset, fd, version} = await this.readHeader(path);

            // Image Data
            //  type    0:raw, 1:rle
            let buf = await RandomAccessFile.read(fd, offset, 2);
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

    async readHeader(path) {
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
        buf = await RandomAccessFile.read(fd, offset, imageResourceLength);
        await this.parseImageResource(buf);

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

        return {offset, fd, version};
    }

    async parseImageResource(buf) {
        let idx = 0;
        const signature = buf.toString('utf8', 0, 4);
        for (; idx < buf.length;) {

            if (signature === '8BIM') {
                idx += 4;
                const id = buf.readUInt16BE(idx);
                idx += 2;
                let name = '';
                for (; ;) {
                    const a = buf[idx];
                    const b = buf[idx + 1];
                    idx += 2;
                    if (b === 0) {
                        if (a !== 0) {
                            name += String.fromCharCode(a);
                        }
                        break;
                    } else {
                        name += String.fromCharCode(a);
                        name += String.fromCharCode(b);
                    }
                }
                const size = buf.readUInt32BE(idx);
                idx += 4;
                const data = buf.subarray(idx, idx + size);
                console.log({id, name, size})
                idx += size;
                if (id === 1058) {
                    await this.parseExif(data)
                    // EXIF Data 1
                }
                if (id === 1059) {
                    // EXIF Data 3
                    // console.log('EXIF Data 3', data.toString());
                }
                if (id === 1060) {
                    // XMP metadata
                    await this.parseXMP(data)
                }
                //console.log(buf.toString())
            }
        }
    }

    async parseExif(data) {
        // add jpg prefix, see https://www.media.mit.edu/pia/Research/deepview/exif.html
        const l = data.length + 8;
        const l1 = Math.floor(l / 256);
        const l2 = l % 256;
        const prefix = Buffer.from([0xff, 0xe1, l1, l2, 0x45, 0x78, 0x69, 0x66, 0, 0])
        const jpg = Buffer.concat([prefix, data])

        const result = require('exif-parser').create(jpg).parse();
        console.log('EXIF:', result.tags)
    }

    async parseXMP(data) {
        //console.log('XMP metadata', data.toString());
        const parser = new xml2js.Parser();
        try {
            parser.parseString(data.toString(), (e, d) => {
                // https://developers.google.com/streetview/spherical-metadata?hl=de
                d['x:xmpmeta']['rdf:RDF'][0]['rdf:Description'].forEach(description => {
                    if (description['$']['xmlns:GPano']) {
                        console.log('XMP:', JSON.stringify(description['$'], null, 2))
                    }
                })
            })
        } catch (err) {
            console.log(err)
        }
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
            if (x % 100 === 0) {
                this.emit('progress', x);
            }
        }
        this.emit('progress', lineCount);
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
         console.log('Line Sizes', lineSizes);
        console.log('offset', offset);

        console.log('Read Image Data.');

        this.emit('begin', lineCount);

        const pool = new StaticWorkerPool(path.resolve(__dirname, 'worker-packbits.js'),1).begin();
        this._lines = new Array(lineCount);
        for (let x = 0; x < lineCount; ++x) {
            const source = await RandomAccessFile.readAsSharedInt8Array(fd, offset, lineSizes[x]);
            //console.log(source);
            pool.exec({
                lineIndex: x,
                source,
                target: new Uint8Array(new SharedArrayBuffer(this.width))
            }).promise.then((result) => {
                const lineIndex = result.data.lineIndex;
                this._lines[lineIndex] = result.data.target;
                if (lineIndex % 100 === 0) {
                    this.emit('progress', lineIndex);
                }
            })

            offset += lineSizes[x];
        }
        this.emit('progress', lineCount);
        await pool.finished();
        await pool.destroy();

        this.emit('end');
    }
}