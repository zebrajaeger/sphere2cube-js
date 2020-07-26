#!/usr/bin/env node

const converter = require('./converter');
const {program} = require('commander');
const fs = require('fs');
const path = require('path');

// find and parse package.json
const p = process.argv[1]
const pjp = path.resolve(p, '../..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(pjp, 'utf-8'))

// cli
program.version(packageJson.version)
program
    // Source
    .requiredOption('-i, --source <path>', 'Source image (mandatory)')
    .option('-ipa, --panoAngle <degree>', 'Angle of pano', '360')
    .option('-ipy, --panoYOffset <degree>', 'Y-Offset in degree [-90.0...90.0]', '0')

    // Output
    .option('-o, --output <path>', 'Output folder', '_dist')
    .option('-te, --targetSize <pixel>', 'Image edge length of a face @ max resolution (default: inputImage.x / 4)', undefined)
    .option('-fr, --facesToRender <faces>', 'Faces To render', 'flrbud')

    // Tiles
    .option('-ti, --tilesIgnore', 'Dont render tiles', 'false')
    .option('-ts, --tileSize <pixel>', 'Tile size', '512')
    .option('-tq, --tileJpgQuality <percent>', 'Jpg Image quality of tiles in percent', '85')
    .option('-tp, --tilePathTemplate <template>', 'Tile path template', '{{levelCount}}/{{face}}{{y}}_{{x}}.{{fileType}}')
    .option('-tpt, --tilePathType <type>', 'Tile image type', 'jpg')

    // Cube
    .option('-c, --renderCube', 'Render cube sites in full resolution', 'true')
    .option('-cp, --cubePath <path>', 'Cube sites path', '{{face}}.jpg')
    .option('-cq, --cubeJpgQuality <percent>', 'Cube Jpg Image quality', '85')

    // Preview
    .option('-pi, --previewIgnore', 'Dont render preview', 'false')
    .option('-pcp, --previewCubePath <path>', 'path and name of preview image', 'preview.q.jpg')
    .option('-pcq, --previewCubeJpgQuality <percent>', 'Preview quality in percent', '85')
    .option('-psp, --previewScaledPath <path>', 'path and name of preview image', 'preview.s.jpg')
    .option('-psq, --previewScaledJpgQuality <percent>', 'Preview quality in percent', '85')
    .option('-pw, --previewWidth <pixel>', 'Preview width', '1000')

    // Signature
    .option('-sp, --signaturImagePath <path>', 'Signature image', undefined)
    .option('-ss, --signaturSide <side>', 'Signature side', 'd')
    .option('-sb, --signaturBelow', 'Signature below pano image', 'false')

    // Html
    .option('-hi, --htmlIgnore', 'Don\'t render html', 'false')
    .option('-ht, --htmlTitle <name>', 'Head-Title-Tag (default: inputImage)', undefined)
    .option('-hpp, --htmlPannellumFile <path>', 'Path of Pannellum .html file', 'index.p.html')
    .option('-hmp, --htmlMarzipanoFile <path>', 'Path of Marzipano .html file', 'index.m.html')

    // Zip
    .option('-zi, --zipIgnore', 'Don\'t zip', 'false')
    .option('-zp, --zipPath <path>', 'Path for Zip File', 'pano.zip')

    // Debug
    .option('-v, --verbose', 'verbose', 'false')

    .parse(process.argv);


let title = program.input;
if (program.htmlTitle && program.htmlTitle.length !== 0) {
    title = program.htmlTitle;
}

const cfg = {
    // Source
    sourceImage: program.source,
    panoAngle: parseFloat(program.panoAngle),
    panoYOffset: parseFloat(program.panoYOffset),

    // Target
    targetFolder: program.output,
    targetImgSize: program.targetSize,
    facesToRender: program.facesToRender,

    // Tiles
    backgroundColor: {r: 0, g: 0, b: 0, a: 0},
    tilesIgnore: Boolean(program.tilesIgnore),
    tileSize: parseInt(program.tileSize, 10),
    tileJpgQuality: parseInt(program.tileJpgQuality, 10),
    tileFileType: program.tilePathType,
    tilePathTemplate: program.tilePathTemplate,

    // Cube
    renderCube: Boolean(program.renderCube),
    cubePath: program.cubePath,
    cubeJpgQuality: program.cubeJpgQuality,

    // Preview
    previewIgnore: Boolean(program.previewIgnore),
    previewWidth: parseInt(program.previewWidth, 10),
    previewCubePath: program.previewCubePath,
    previewCubeJpgQuality: parseInt(program.previewCubeJpgQuality, 10),
    previewScaledPath: program.previewScaledPath,
    previewScaledJpgQuality: parseInt(program.previewScaledJpgQuality, 10),

    // Signature
    signaturImagePath: program.signaturImagePath,
    signaturSide: program.signaturSide,
    signaturBelow: Boolean(program.signaturBelow),

    // Html
    htmlIgnore: Boolean(program.htmlIgnore),
    htmlTitle: title,
    htmlPannellumFile: program.htmlPannellumFile,
    htmlMarzipanoFile: program.htmlMarzipanoFile,

    // Zip
    zipPath: program.zipPath,
    zipIgnore: Boolean(program.zipIgnore),

    // Debug
    verbose: Boolean(program.verbose)
};

if (cfg.verbose) {
    console.log({input: program.input, output: program.output})
    console.log(cfg)
}

converter.renderPano(cfg).then();
