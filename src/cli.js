#!/usr/bin/env node

const converter = require('./converter');
const {program} = require('commander');

program.version('0.0.1');
program
    .requiredOption('-i, --input <path>', 'Input image')
    .option('-a, --angle <degree>', 'Angle of pano', '360')
    .option('-y, --yOffset <degree>', 'Y-Offset in degree [-90.0...90.0]', '0')

    .option('-o, --output <path>', 'Output folder', '.')
    .option('-s, --targetSize <pixel>', 'Image edge length of a face @ max resolution', undefined)

    .option('-ti, --tilesIgnore', 'Dont render tiles', 'false')
    .option('-ts, --tileSize <pixel>', 'Tile size', '512')
    .option('-tq, --tileQuality <percent>', 'Image quality of tiles in percent', '85')

    .option('-pi, --previewIgnore', 'Dont render preview', 'false')
    .option('-pp, --previewPath <path>', 'path and name of preiew image', './preview.png')
    .option('-pw, --previewWidth <pixel>', 'Preview width', '1000')
    .option('-pw, --previewQuality <percent>', 'Preview quality in percent', '85')

    .option('-hi, --htmlIgnore', 'Don\'t render html', 'false')

    .option('-v, --verbose', 'verbose', 'false')

    .parse(process.argv);

const cfg = {
    targetImgSize: program.targetSize,
    angel: parseFloat(program.angle),
    yOffset: parseFloat(program.yOffset),

    backgroundColor: {r: 0, g: 0, b: 0, a: 0},
    tilesIgnore: Boolean(program.tilesIgnore),
    tileSize: parseInt(program.tileSize, 10),
    tileQuality: parseInt(program.tileQuality, 10),

    previewIgnore: Boolean(program.previewIgnore),
    previewWidth: parseInt(program.previewWidth, 10),
    previewPath: program.previewPath,
    previewQuality: parseInt(program.previewQuality, 10),

    htmlIgnore: Boolean(program.htmlIgnore),

    verbose: Boolean(program.verbose)
};

if(cfg.verbose){
    console.log(cfg)
}

converter.renderPano(program.input, program.output, cfg).then();
