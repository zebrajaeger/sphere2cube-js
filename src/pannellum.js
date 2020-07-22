module.exports = {
    createHtml: createHtml
}

function createHtml(data) {
    return `
<!DOCTYPE HTML>
<html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data.htmlTitle}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
        <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
        <style>
        html, body {
            margin:0px;
            height:100%;
            background: black;
        }
        .panorama {
            width: calc(100vw - 1px);
            height: calc(100vh - 1px);
        }
        </style>
    </head>
    <body>
    
    <div id="panorama" class="panorma"></div>
    
    <script>
        pannellum.viewer('panorama', {
            "type": "multires",
            "multiRes": {
                "basePath": ".",
                "path": "/%l/%s%y_%x",
                "extension": "png",
                "tileResolution": ${data.tileSize},
                "maxLevel": ${data.maxLevelToRender + 1},
                "cubeResolution": ${data.targetImageSize},
            }, 
            "autoRotate": 2,
            "preview": "${data.previewPath}",
            "autoLoad": false,
            "minYaw": ${data.area.x.min},
            "maxYaw": ${data.area.x.max},
            "minPitch": ${data.area.y.min},
            "maxPitch": ${data.area.y.max}
        });
    </script>
    
    </body>
</html>
`;
}

