const EventEmitter = require('events');
const {IMG} = require('./img');

class FaceRenderer extends EventEmitter {

    constructor(sourceImage, w, xOffset, yOffset) {
        super();
        this.sourceImage = sourceImage;
        this.w = w;
        this.xOffset = xOffset;
        this.yOffset = yOffset;
    }

    render(face, outImgSize) {
        console.log('FaceRenderer.render', {face, outImgSize})
        const img = new IMG();
        img.create(outImgSize, outImgSize);
        img.fill({r: 0, g: 0, b: 0, a: 0});

        this.convert2(this.w,
            outImgSize,
            face,
            (x, y) => this.sourceImage.getPixel(x - this.xOffset, y - this.yOffset),
            (x, y, color) => img.setPixel(x, y, color)
        )
        return img;
    }

    outImgToXYZ2(a, b, face) {
        // a:  [-1..1]
        // b: [-1..1]
        if (face === 0) {
            // back
            return {x: -1, y: -a, z: -b}
        } else if (face === 1) {
            // left
            return {x: a, y: -1, z: -b}
        } else if (face === 2) {
            // front
            return {x: 1, y: a, z: -b}
        } else if (face === 3) {
            // right
            return {x: -a, y: 1, z: -b}
        } else if (face === 4) {
            // top
            return {x: b, y: a, z: 1}
        } else if (face === 5) {
            // bottom
            return {x: -b, y: a, z: -1}
        }
    }

    convert2(inX, edgeOut, face, getPixel, setPixel) {
        const inSize = {x: inX, y: inX / 2, edge: inX / 4}

        this.emit('begin', edgeOut * edgeOut);

        for (let i = 0; i < edgeOut; ++i) {
            const a = (2 * i / edgeOut) - 1; // [-1..1[

            for (let j = 0; j < edgeOut; ++j) {
                const b = (2 * j / edgeOut) - 1; // [-1..1[

                const xyz = this.outImgToXYZ2(a, b, face)
                try {
                    let rgba = calcPixel(xyz, inSize, getPixel);
                    setPixel(i, j, rgba);
                } catch (err) {
                    console.log(err, {i, j, a, b, xyz})
                    throw err;
                }

            }
            if(i%100===0){
                this.emit('progress', (edgeOut * i));
            }
        }

        this.emit('progress', edgeOut * edgeOut);
        this.emit('end');
    }
}

class PreviewRenderer extends EventEmitter {

    constructor(sourceImage, w, xOffset, yOffset) {
        // constructor(sourceImage) {
        super();
        this.sourceImage = sourceImage;
        this.w = w;
        this.xOffset = xOffset;
        this.yOffset = yOffset;
    }

    render(previewWidth) {
        const img = new IMG();
        img.create(previewWidth, previewWidth * 3 / 4);

        this.convert(
            this.w,
            previewWidth,
            (x, y) => this.sourceImage.getPixel(x - this.xOffset, y - this.yOffset),
            (x, y, pixel) => img.setPixel(x, y, pixel)
        )
        return img;
    }

    outImgToXYZ(a, b, face) {
        // a:  [0..8[
        // b: [0..6[
        if (face === 0) {
            // back
            // a:  [0..2[
            // b: [2..4[
            return {x: -1.0, y: 1.0 - a, z: 3.0 - b} // y,z: [-1..1]
        } else if (face === 1) {
            // left
            // a:  [2..4[
            // b: [2..4[
            return {x: a - 3.0, y: -1.0, z: 3.0 - b}  // x,z: [-1..1]
        } else if (face === 2) {
            // front
            // a:  [4..6[
            // b: [2..4[
            return {x: 1.0, y: a - 5.0, z: 3.0 - b}  // y,z: [-1..1]
        } else if (face === 3) {
            // right
            // a:  [6..8[
            // b: [2..4[
            return {x: 7.0 - a, y: 1.0, z: 3.0 - b}  // x,z: [-1..1]
        } else if (face === 4) {
            // top
            // a:  [4..6[
            // b: [0..2[
            return {x: b - 1.0, y: a - 5.0, z: 1.0}  // x,y: [-1..1]
        } else if (face === 5) {
            // bottom
            // a:  [4..6[
            // b: [4..6[
            return {x: 5.0 - b, y: a - 5.0, z: -1.0} // y,z: [-1..1]
        }
    }


    convert(inX, outX, getPixel, setPixel) {
        const inSize = {x: inX, y: inX / 2, edge: inX / 4}

        const outSize = {x: outX, y: outX * 3 / 4}
        const edgeOut = outSize.x / 4   // the length of each edge in pixels

        for (let i = 0; i < outSize.x; ++i) {
            const a = 2 * i / edgeOut; // [0..8[

            const face = Math.floor(i / edgeOut) // 0 - back, 1 - left 2 - front, 3 - right
            let j1, j2;
            if (face === 2) {
                j1 = 0;
                j2 = edgeOut * 3;
            } else {
                j1 = edgeOut;
                j2 = edgeOut * 2;
            }

            for (let j = j1; j < j2; ++j) {
                const b = 2 * j / edgeOut; // [0..6[

                let face2;
                if (j < edgeOut) {
                    // top
                    face2 = 4
                } else if (j >= 2 * edgeOut) {
                    // bottom
                    face2 = 5
                } else {
                    face2 = face
                }

                const xyz = this.outImgToXYZ(a, b, face2)
                let rgba = calcPixel(xyz, inSize, getPixel);

                setPixel(i, j, rgba);
            }
        }
    }
}

function calcPixel(xyz, inSize, getPixel) {
    const theta = Math.atan2(xyz.y, xyz.x) // range -pi to pi
    const r = Math.hypot(xyz.x, xyz.y)
    const phi = Math.atan2(xyz.z, r) // range -pi/2 to pi/2

    // source img coords
    const uf = (2.0 * inSize.edge * (theta + Math.PI) / Math.PI)
    const vf = (2.0 * inSize.edge * (Math.PI / 2 - phi) / Math.PI)

    // Use bilinear interpolation between the four surrounding pixels
    const u1 = Math.floor(uf)  // coord of pixel to bottom left
    const v1 = Math.floor(vf)
    const u2 = u1 + 1       // coords of pixel to top right
    const v2 = v1 + 1
    const mu = uf - u1      // fraction of way across pixel
    const nu = vf - v1

    // Pixel values of four corners
    try {
        const A = getPixel(u1 % inSize.x, clip(v1, 0, inSize.y - 1));
        const B = getPixel(u2 % inSize.x, clip(v1, 0, inSize.y - 1))
        const C = getPixel(u1 % inSize.x, clip(v2, 0, inSize.y - 1))
        const D = getPixel(u2 % inSize.x, clip(v2, 0, inSize.y - 1))

        // interpolate
        return {
            r: Math.floor(A.r * (1 - mu) * (1 - nu) + B.r * (mu) * (1 - nu) + C.r * (1 - mu) * nu + D.r * mu * nu),
            g: Math.floor(A.g * (1 - mu) * (1 - nu) + B.g * (mu) * (1 - nu) + C.g * (1 - mu) * nu + D.g * mu * nu),
            b: Math.floor(A.b * (1 - mu) * (1 - nu) + B.b * (mu) * (1 - nu) + C.b * (1 - mu) * nu + D.b * mu * nu),
            a: Math.floor(A.a * (1 - mu) * (1 - nu) + B.a * (mu) * (1 - nu) + C.a * (1 - mu) * nu + D.a * mu * nu)
        };
    } catch (err) {
        console.log({u1, v1, u2, v2, mu, nu})
        throw err;
    }
}

function clip(v, min, max) {
    if (v < min) {
        return min;
    }
    if (v > max) {
        return max;
    }
    return v;
}

module.exports.FaceRenderer = FaceRenderer;
module.exports.PreviewRenderer = PreviewRenderer;
