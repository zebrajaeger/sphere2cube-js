const fs = require('fs');
const EventEmitter = require('events');
const buffer = require('buffer');

const jpeg = require('jpeg-js');
const PNG = require("pngjs").PNG;

const {Bilinear} = require('./scale');

class BaseIMG extends EventEmitter {
    _width;
    _height;
    _backgroundColor = {r: 0, g: 0, b: 0, a: 0}

    constructor() {
        super();
    }

    create(w, h) {
        this._width = w;
        this._height = h;
        return this;
    }

    fill(color) {
        this.emit('fillBegin', this._height);

        for (let j = 0; j < this._height; ++j) {
            for (let i = 0; i < this._width; ++i) {
                this.setPixel(i, j, color)
            }
            this.emit('fillProgress', this.j + 1);
        }

        this.emit('fillEnd');
        return this;
    }

    newScaledByFactor(factor) {
        const tX = Math.round(this.width * factor);
        const tY = Math.round(this._height * factor);

        const resultImage = (BaseIMG.isBigIMGNeeded(tX, tY))
            ? new BigIMG().create(tX, tY)
            : new IMG().create(tX, tY);

        const bilinear = new Bilinear();
        bilinear.on('begin', lineCount => this.emit('scaleBegin', lineCount));
        bilinear.on('progress', line => this.emit('scaleProgress', line));
        bilinear.on('end', () => this.emit('scaleEnd'))
        bilinear.scale(
            {w: this.width, h: this.height},
            {w: resultImage.width, h: resultImage.height},
            (x, y) => {
                return this.getPixel(x, y)
            },
            (x, y, pixel) => {
                resultImage.setPixel(x, y, pixel)
            });

        return resultImage;
    }

    toIMG() {
        return this;
    }

    get width() {
        return this._width;
    }

    get height() {
        return this._height;
    }

    get backgroundColor() {
        return this._backgroundColor;
    }

    set backgroundColor(value) {
        this._backgroundColor = value;
    }

    write(path, options) {
        throw new Error('Not supported');
    }

    load(path) {
        throw new Error('Not supported');
    }

    getPixel(x, y) {
        throw new Error('Not supported');
    }

    setPixel(x, y, pixel) {
        throw new Error('Not supported');
    }

    static isJpg(path) {
        const p = path.toLowerCase();
        return (p.endsWith('.jpg') || p.endsWith('.jpg'));
    }

    static isPng(path) {
        const p = path.toLowerCase();
        return (p.endsWith('.png'));
    }

    static isBigIMGNeeded(w, h) {
        const l = h * w * 4;
        return (l > buffer.constants.MAX_LENGTH);
    }
}

class BigIMG extends BaseIMG {
    _data;

    constructor() {
        super();
    }

    create(w, h) {
        super.create(w, h);
        this._data = [];
        for (let i = 0; i < h; ++i) {
            this._data.push(new Buffer.alloc(w * 4));
        }
        return this;
    }

    getPixel(x, y) {
        if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
            return this._backgroundColor;
        } else {
            const b = this._data[y];
            const adr = (x << 2);
            return {r: b[adr], g: b[adr + 1], b: b[adr + 2], a: b[adr + 3],}
        }
    }

    setPixel(x, y, pixel) {
        if (x >= 0 && x < this._width && y >= 0 && y < this._height) {
            const b = this._data[y];
            let adr = (x << 2);

            b[adr++] = pixel.r;
            b[adr++] = pixel.g;
            b[adr++] = pixel.b;
            b[adr] = pixel.a;
        }
    }

    toIMG() {
        const result = new IMG();
        result.create(this._width, this._height);
        for (let y = 0; y < this._height; ++y) {
            for (let x = 0; x < this._width; ++x) {
                result.setPixel(x, y, this.getPixel(x, y));
            }
        }
        return result;
    }

}


class IMG extends BaseIMG {
    _data;

    constructor() {
        super();
    }

    create(w, h) {
        super.create(w, h);
        const l = h * w * 4;
        if (l > buffer.constants.MAX_LENGTH) {
            throw new Error(`IMG cant handle this size: ${l}. Max is ${buffer.constants.MAX_LENGTH}`)
        }
        this._data = new Buffer.alloc(l);
        return this;
    }

    write(path, options) {
        options = options || {jpgQuality: 85}
        if (BaseIMG.isPng(path)) {
            const buffer = PNG.sync.write({width: this._width, height: this._height, data: this._data}, {
                colorType: 6,
                inputHasAlpha: true
            });
            fs.writeFileSync(path, buffer);
            return true;
        } else if (BaseIMG.isJpg(path)) {
            const jpegImageData = jpeg.encode({
                width: this._width,
                height: this.height,
                data: this._data
            }, options.jpgQuality);
            fs.writeFileSync(path, jpegImageData.data);
            return true;
        }
        return false;
    }

    async load(path) {
        if (BaseIMG.isJpg(path)) {
            const jpegData = fs.readFileSync(path);
            const rawImageData = jpeg.decode(jpegData, {maxMemoryUsageInMB: 100000, maxResolutionInMP: 100000});
            this._data = rawImageData.data;
            this._width = rawImageData.width;
            this._height = rawImageData.height;
            return true;
        } else if (BaseIMG.isPng(path)) {
            const data = fs.readFileSync(path);
            const png = PNG.sync.read(data);
            this._data = png.data;
            this._width = png.width;
            this._height = png.height;
        }
        return false;
    }

    getPixel(x, y) {
        if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
            return this._backgroundColor;
        } else {
            const adr = ((y * this._width) + x) << 2;
            return {r: this._data[adr], g: this._data[adr + 1], b: this._data[adr + 2], a: this._data[adr + 3],}
        }
    }

    setPixel(x, y, pixel) {
        if (x >= 0 && x < this._width && y >= 0 && y < this._height) {
            let adr = ((y * this._width) + x) << 2;
            this._data[adr++] = pixel.r;
            this._data[adr++] = pixel.g;
            this._data[adr++] = pixel.b;
            this._data[adr] = pixel.a;
        }
    }
}

module.exports.IMG = IMG;
module.exports.BigIMG = BigIMG;
