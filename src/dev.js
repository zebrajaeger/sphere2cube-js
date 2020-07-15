const converter = require('./converter');

// const file = 'C:/temp/test.psd';
const file = 'C:/temp/test_10k.psd';
// const file = 'C:/prj.lars/sphere2cube/samples/test.psb';
const basePath = 'c:/temp/!panotest/';

const cfg = {
    targetImgSize: undefined,
    previewWidth: 1000,
    tileSize: 512,
    backgroundColor: {r: 0, g: 0, b: 0, a: 0}
};

converter.renderPano(file, basePath, cfg).then();
