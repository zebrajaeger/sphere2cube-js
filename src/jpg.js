const Jimp = require('jimp');
const EventEmitter = require('events');

/**
 * Should work with:
 * @jimp/jpeg
 * @jimp/png
 * @jimp/bmp
 * @jimp/tiff
 * @jimp/gif
 *
 * @type {JPG}
 */
module.exports.JPG = class JPG extends EventEmitter {
    image;
    _width;
    _height;
    _backgroundColor = {r: 0, g: 0, b: 0, a: 0}

    constructor(path) {
        super();
    }

    async load(path) {
        this.image = await Jimp.read(path);
        this._width = this.image.bitmap.width;
        this._height = this.image.bitmap.height;
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
        // console.log({l:this._lines})
        if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
            return this._backgroundColor;
        } else {
            return Jimp.intToRGBA(this.image.getPixelColor(x, y));
        }
    }
}
