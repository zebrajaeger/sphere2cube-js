const fs = require('fs');
const EventEmitter = require('events');

const jpeg = require('jpeg-js');
const PNG = require("pngjs").PNG;

const {Bilinear} = require('./scale');

module.exports.IMG = class IMG extends EventEmitter {
    _data;
    _width;
    _height;
    _backgroundColor = {r: 0, g: 0, b: 0, a: 0}

    constructor() {
        super();
    }

    create(w, h) {
        this._width = w;
        this._height = h;
        this._data = new Buffer.alloc(h * w * 4);
    }

    fill(color) {
        for (let i = 0; i < this._width; ++i) {
            for (let j = 0; j < this._height; ++j) {
                this.setPixel(i, j, color)
            }
        }
    }

    write(path, options) {
        options = options || {jpgQuality: 85}
        if (this.isPng(path)) {
            const buffer = PNG.sync.write({width: this._width, height: this._height, data: this._data}, {
                colorType: 6,
                inputHasAlpha: true
            });
            fs.writeFileSync(path, buffer);
            return true;
        } else if (this.isJpg(path)) {
            const jpegImageData = jpeg.encode({width: this._width, height: this.height, data: this._data}, options.jpgQuality);
            fs.writeFileSync(path, jpegImageData.data);
            return true;
        }
        return false;
    }

    async load(path) {
        if (this.isJpg(path)) {
            const jpegData = fs.readFileSync(path);
            const rawImageData = jpeg.decode(jpegData, {maxMemoryUsageInMB: 100000, maxResolutionInMP: 100000});
            this._data = rawImageData.data;
            this._width = rawImageData.width;
            this._height = rawImageData.height;
            return true;
        } else if (this.isPng(path)) {
            const data = fs.readFileSync(path);
            const png = PNG.sync.read(data);
            this._data = png.data;
            this._width = png.width;
            this._height = png.height;
        }
        return false;
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

    isJpg(path) {
        const p = path.toLowerCase();
        return (p.endsWith('.jpg') || p.endsWith('.jpg'));
    }

    isPng(path) {
        const p = path.toLowerCase();
        return (p.endsWith('.png'));
    }

    newScaledByFactor(factor) {
        const tX = Math.round(this.width / 2);
        const tY = Math.round(this._height / 2);
        const tempImg = new IMG();
        tempImg.create(tX, tY);

        const bilinear = new Bilinear();
        bilinear.scale(
            {w: this.width, h: this.height},
            {w: tempImg.width, h: tempImg.height},
            (x, y) => {
                return this.getPixel(x, y)
            },
            (x, y, pixel) => {
                tempImg.setPixel(x, y, pixel)
            });
        return tempImg;
    }
}
