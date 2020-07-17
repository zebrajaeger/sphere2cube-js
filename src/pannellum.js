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
        <title>Multiresolution panorama</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
        <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
        <style>
        #panorama {
            width: 600px;
            height: 400px;
        }
        </style>
    </head>
    <body>
    
    <div id="panorama"></div>
    <script>
        pannellum.viewer('panorama', {
            "type": "multires",
            "multiRes": {
                "basePath": ".",
                "path": "/%l/%s%y_%x",
                "extension": "png",
                "tileResolution": ${data.tileSize},
                "maxLevel": ${data.maxLevelToRender + 1},
                "cubeResolution": ${data.targetImageSize}
            }, 
            "autoLoad": true
        });
    </script>
    
    </body>
</html>
`;
}

