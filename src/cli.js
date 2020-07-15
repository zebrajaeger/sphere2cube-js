#!/usr/bin/env node

// console.log('YO!!!');
const converter = require('./converter');


const basePath = '.';

const cfg = {
    targetImgSize: undefined,
    previewWidth: 1000,
    tileSize: 512,
    backgroundColor: {r: 0, g: 0, b: 0, a: 0}
};

// for (let j = 0; j < process.argv.length; j++) {
//     console.log(j + ' -> ' + (process.argv[j]));
// }

converter.renderPano(process.argv[2], basePath, cfg).then();
