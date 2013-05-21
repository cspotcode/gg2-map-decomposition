function runConversion() {

    var img = document.getElementById('map-img');
    var canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    var mapCtx = canvas.getContext('2d');
    mapCtx.drawImage(img, 0, 0);
    var imageData = window.imageData = mapCtx.getImageData(0, 0, canvas.width, canvas.height);
    
    // grab the lower-left pixel to use for transparency
    var airColor = imageData.data[(canvas.height - 1) * canvas.width * 4];
    
    // TODO use a single bit for each pixel rather than an entire Uint8
    var pixelCoverage = new Uint8Array(canvas.width * canvas.height);
    // spec says that the contents of the array are initialized to 0
    var bitmap = {
        width: canvas.width,
        height: canvas.height,
        getPixel: function(x, y) {
            if(x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
            // Grab the red value.  Assume that red value is zero for walls, non-zero for air
            // Cast it to a boolean
            return imageData.data[(y * this.width + x) * 4] !== airColor;
        },
        setPixelCovered: function(x, y, val) {
            pixelCoverage[y * this.width + x] = val|0;
        },
        getPixelCovered: function(x, y) {
            return !!pixelCoverage[y * this.width + x];
        }
    };
    
    
    var vertex = function(x, y) {
        return {x: x, y: y};
    };
    
    mapScale = 6;
    
    // Find all vertical walls and one-pixel blocks
    // If a three-pixel vertical wall is at the very top of the map, then wallStartY = 0 and wallEndY = 2 (*not* 3)
    
    // TODO terrible function name
    var scanAxis = function(getPixel, getPixelCovered, setPixelCovered, createVertex, width, height, polygons, createOneByOnePolygons) {
        var wallStartY, wallEndY,
            wallStartLeft, wallStartRight, wallEndLeft, wallEndRight,
            wallStartLeftY, wallStartRightY, wallEndLeftY, wallEndRightY,
            wallLeftX, wallRightX,
            isOneByOnePolygon,
            polygon;
        for(var x = 0; x < width; x++) {
            yLoop:
            for(var y = 0; y < height; y++) {
                if(getPixel(x, y)) {
                    wallStartY = y;
                    for(; y < height && getPixel(x, y); y++) {}
                    // y now points to the first non-solid pixel
                    wallEndY = y - 1;
                    // move the top of this wall downwards until it is exposed on either the left or the right side, and it is not completely covered by another polygon
                    while(1) {
                        wallStartLeft = getPixel(x - 1, wallStartY);
                        wallStartRight = getPixel(x + 1, wallStartY);
                        // air on either side and pixel is not already covered?  stop looping
                        if((!wallStartLeft || !wallStartRight) && !getPixelCovered(x, wallStartY)) break;
                        // walls on both sides, move down
                        wallStartY++;
                        // did we move down too far?  No need to generate a polygon
                        if(wallStartY > wallEndY) continue yLoop;
                    }
                    // move the bottom of this wall upwards until it is exposed on either the left or the right side
                    while(1) {
                        wallEndLeft = getPixel(x - 1, wallEndY);
                        wallEndRight = getPixel(x + 1, wallEndY);
                        // air on either side and pixel is not already covered?  stop looping
                        if((!wallEndLeft || !wallEndRight) && !getPixelCovered(x, wallEndY)) break;
                        if(!wallEndLeft || !wallEndRight) break;
                        // walls on both sides, move up
                        wallEndY--;
                        // did we move up too far?  No need to generate a polygon
                        if(wallStartY > wallEndY) continue yLoop;
                    }
                    // Is this a one-by-one wall?
                    if(isOneByOnePolygon = (wallStartY == wallEndY)) {
                        // Skip if we've been told not to create one-by-one blocks
                        if(!createOneByOnePolygons) continue yLoop;
                        // Skip if we're bordered on any side by a wall.
                        //if(wallStartLeft || wallStartRight/* || getPixel(x, wallStartY - 1) || getPixel(x, wallStartY + 1)*/) continue yLoop;
                    }
/*                    wallStartLeft = getPixel(x - 1, wallStartY);
                    wallStartRight = getPixel(x + 1, wallStartY);
                    wallEndLeft = getPixel(x - 1, wallEndY);
                    wallEndRight = getPixel(x + 1, wallEndY);*/
                    wallStartLeftY = (wallStartY + (wallStartLeft && !isOneByOnePolygon && !getPixel(x - 1, wallStartY - 1)));
                    wallStartRightY = (wallStartY + (wallStartRight && !isOneByOnePolygon && !getPixel(x + 1, wallStartY - 1)));
                    wallEndLeftY = (wallEndY + 1 - (wallEndLeft && !isOneByOnePolygon && !getPixel(x - 1, wallEndY + 1)));
                    wallEndRightY = (wallEndY + 1 - (wallEndRight && !isOneByOnePolygon && !getPixel(x + 1, wallEndY + 1)));
                    wallLeftX = x;
                    wallRightX = (x + 1);
                    // Mark all of the squares that are completely covered by this polygon
                    for(var i = Math.max(wallStartLeftY, wallStartRightY), l = Math.min(wallEndLeftY, wallEndRightY); i < l; i++) {
                        setPixelCovered(x, i, true);
                    }
                    polygon = [
                        createVertex(wallLeftX * mapScale, wallStartLeftY * mapScale),
                        createVertex(wallRightX * mapScale, wallStartRightY * mapScale),
                        createVertex(wallRightX * mapScale, wallEndRightY * mapScale),
                        createVertex(wallLeftX * mapScale, wallEndLeftY * mapScale)
                    ];
                    polygons.push(polygon);
                    console.log('Poly: ', wallStartLeftY, wallStartRightY, wallEndLeftY, wallEndRightY, wallLeftX, wallRightX);
                }
            }
        }
    };
    
    // Oh wait!  This will find vertical strips of wall that are completely or partially hidden between adjacent walls.
    // It will also find vertical walls that span multiple vertical wall segments.  Should we combine those?
    
    var polygons = [];

    // Find horizontal walls
    scanAxis(function(x, y) {return bitmap.getPixel(y, x)},
        function(x, y) {return bitmap.getPixelCovered(y, x)},
        function(x, y, val) {return bitmap.setPixelCovered(y, x, val)},
        function(x, y) {return new vertex(y, x)},
        bitmap.height, bitmap.width, polygons, false
    );
    // Find vertical walls and 1x1 walls
    scanAxis(function(x, y) {return bitmap.getPixel(x, y)},
             function(x, y) {return bitmap.getPixelCovered(x, y)},
             function(x, y, val) {return bitmap.setPixelCovered(x, y, val)},
             function(x, y) {return new vertex(x, y)},
             bitmap.width, bitmap.height, polygons, true
            );
    
    // Create canvas to output polygons onto
    var destinationCanvas = document.createElement('canvas');
    destinationCanvas.width = bitmap.width * mapScale;
    destinationCanvas.height = bitmap.height * mapScale;
    var ctx = destinationCanvas.getContext('2d');
    
    // Disable image interpolation
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    
    ctx.drawImage(img, 0, 0, destinationCanvas.width, destinationCanvas.height);
    ctx.lineWidth = 1;
    
    polygons.forEach(function(polygon) {
        ctx.beginPath();
        var l = polygon.length;
        ctx.moveTo(polygon[l-1].x, polygon[l-1].y);
        for(var i = 0; i < l; i++) {
            ctx.lineTo(polygon[i].x, polygon[i].y);
        };
        ctx.stroke();
    });
    
    document.body.appendChild(canvas);
    document.getElementsByClassName('map-container')[0].appendChild(destinationCanvas);
    
    jsonOutputElement = document.createElement('pre');
    jsonOutputElement.classList.add('json-output');
    jsonOutputElement.appendChild(
        document.createTextNode(JSON.stringify(polygons, null, '  '))
    );
    document.body.appendChild(jsonOutputElement);
    
    // Create the physics simulation
    var Space = nape.space.Space,
        Vec2 = nape.geom.Vec2,
        Polygon = nape.shape.Polygon,
        Circle = nape.shape.Circle,
        Body = nape.phys.Body,
        BodyType = nape.phys.BodyType;
    
    var gravity = Vec2.weak(0, 600);
    var space = new Space(gravity);
    var walls = new Body(BodyType.STATIC);
    polygons.forEach(function(polygon) {
        var points = polygon.map(function(point) {
            return Vec2.get(point.x, point.y);
        });
        walls.shapes.add(new Polygon(points));
    });
    walls.space = space;
    
    var floor = new Body(BodyType.STATIC);
    var floorShape = new Polygon(Polygon.rect(100, 100, 200, 1));
    floor.shapes.add(floorShape);
    floor.space = space;
    
    // Create the circle that will bounce around
    var ball = new Body(BodyType.DYNAMIC);
    ball.shapes.add(new Circle(50));
    ball.position.setxy(2000, 350);
    ball.angularVel = 10;
    ball.space = space;
    
    var ballElem = document.getElementById('ball');
    var framerate = 60;
    var animateAFrame = function() {
        requestAnimationFrame(animateAFrame);
        
        space.step(1 / framerate);
        
        ballElem.style.left = ball.position.x - 50 + 'px';
        ballElem.style.top = ball.position.y - 50 + 'px';
        ballElem.style.webkitTransform = 'rotate(' + ball.rotation + 'rad)';
    }
    animateAFrame();
};
