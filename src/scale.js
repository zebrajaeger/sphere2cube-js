const EventEmitter = require('events');

class Bilinear extends EventEmitter {
    scale(srcParams, targetParams, getPixel, setPixel) {

        const wSrc = srcParams.w;
        const hSrc = srcParams.h;

        const wDst = targetParams.w;
        const hDst = targetParams.h;

        const assign = function (dX, dY,
                                 x, xMin, xMax,
                                 y, yMin, yMax,
                                 getPixel, setPixel) {
            const vMin = interpolate(x, xMin, getPixel(xMin, yMin), xMax, getPixel(xMax, yMin));

            // special case, y is integer
            if (yMax === yMin) {
                setPixel(dX, dY, vMin);
            } else {
                const vMax = interpolate(x, xMin, getPixel(xMin, yMax), xMax, getPixel(xMax, yMax));
                setPixel(dX, dY, interpolate(y, yMin, vMin, yMax, vMax));
            }
        }

        const interpolate = function (k, kMin, vMin, kMax, vMax) {
            // special case - k is integer
            if (kMin === kMax) {
                return vMin;
            }

            return {
                r: Math.round((k - kMin) * vMax.r + (kMax - k) * vMin.r),
                g: Math.round((k - kMin) * vMax.g + (kMax - k) * vMin.g),
                b: Math.round((k - kMin) * vMax.b + (kMax - k) * vMin.b),
                a: Math.round((k - kMin) * vMax.a + (kMax - k) * vMin.a)
            }
        }

        this.emit('begin', hDst - 1);
        for (let i = 0; i < hDst; i++) {
            for (let j = 0; j < wDst; j++) {
                // x & y in src coordinates
                const x = (j * wSrc) / wDst;
                const xMin = Math.floor(x);
                const xMax = Math.min(Math.ceil(x), wSrc - 1);

                const y = (i * hSrc) / hDst;
                const yMin = Math.floor(y);
                const yMax = Math.min(Math.ceil(y), hSrc - 1);

                assign(j, i, x, xMin, xMax, y, yMin, yMax, getPixel, setPixel);
            }
            this.emit('progress', i)
        }
        this.emit('end')
    }

}

module.exports.Bilinear = Bilinear;


module.exports.nearestNeighbour = (src, dst, getPixel, setPixel) => {
    const wSrc = src.w;
    const hSrc = src.h;

    const wDst = dst.w;
    const hDst = dst.h;

    console.log('nearestNeighbour', {src, dst}, {wSrc, hSrc, wDst, hDst})
    for (let i = 0; i < hDst; i++) {
        for (let j = 0; j < wDst; j++) {
            const iSrc = Math.floor((i * hSrc) / hDst);
            const jSrc = Math.floor((j * wSrc) / wDst);
            setPixel(j, i, getPixel(jSrc, iSrc));
        }
    }
}

