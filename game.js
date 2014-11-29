'use strict';
    (function initGame(level, points, lives) {
        // Hide all levels
        $('.level').hide();
        var levelDiv = document.getElementById("level"+level);
        if(!levelDiv) {
          level = 1;
          levelDiv = document.getElementById("level"+level);
        }
        // Show current level
        $(levelDiv).show();

        var field = document.getElementById("fieldDiv");
        var platform = document.getElementById("platformDiv");
        var ball = document.getElementById("ballDiv");
        var livesDiv = document.getElementById("livesDiv");
        var pointsDiv = document.getElementById("pointsDiv");
        var dialogDiv = document.getElementById("dialogDiv");
        var displayDiv = document.getElementById("displayDiv");
        var frameRateDiv = document.getElementById("frameRateDiv");
        var levelInfoDiv = document.getElementById("levelInfoDiv");

        var fieldX = field.offsetLeft;
        var fieldWidth = field.clientWidth;
        var fieldHeight = field.clientHeight;

        var platformX = platform.offsetLeft;
        var platformY= platform.offsetTop;
        var platformWidth = platform.clientWidth;
        var plarformHeight = platform.clientHeight;
        var platformWidth = platform.clientWidth;
        var platformHeight = platform.clientHeight;

        var ballX = ball.offsetLeft;
        var ballY = ball.offsetTop;
        var ballWidth = ball.clientWidth;
        var ballHeight = ball.clientHeight;
        var ballRadius = ballWidth/2;
        var velocityX = 0;
        var velocityY = 0;

        // Blocks model
        var blocks = makeArrayFromElements($('#level'+level+' > div.block'));
        var blocksCount = blocks.length;
        var blocksMatrix = makeMatrixFromBlocks(blocks);

        // Set to true to launch
        var launched = false;
        // For ball animation at platform before launch
        var frameCount = 0;
        // For frame throtling
        var prevTime = new Date().getTime();
        var loop = false;
        var frameRate = 60;

        // Polyfill for requestAnimationFrame() function
        var requestAnimFrame = (function() {
          return window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.oRequestAnimationFrame ||
            window.msRequestAnimationFrame ||
            function( /* function */ callback, /* DOMElement */ element) {
                window.setTimeout(callback, 1000 / frameRate);
            };
        })();

        // Cache information about each block into array
        function makeArrayFromElements(elements) {
            var hit = function block_hit() {
              this.element.css('visibility', 'hidden');
              this.visible = false;
              blocksCount--;
            }
            var show = function block_show() {
              this.element.css('visibility', 'visible');
            }

            var isVisible = function block_isVisible() {
              return this.visible;
            }

            var array=[];
            for(var i=0; i<elements.length; i++) {
                var elem=$(elements[i]);
                array.push({
                    position:elem.position(),
                    x:elem.position().left,
                    y:elem.position().top,
                    width:elem.width(),
                    height:elem.height(),
                    element:elem,
                    visible:true,
                    hit:hit,
                    isVisible:isVisible,
                    show:show
                });
            }
            return array;
        }

        // Divide field space into matrix and store link to block into each corresponding cell
        // for faster access.
        function makeMatrixFromBlocks(blocks) {
          var matrix={};

          // Get list of available blocks at given coordinates
          matrix.getBlocksAtPoint = function matrix_getBlocksAtPoint(x,y) {
              var cellX = (x/ballWidth) | 0;
              var cellY = (y/ballHeight) | 0;
              return matrix[cellX+','+cellY] || [];
          };

          // Store link to block at given coordinates
          matrix.storeBlockInMatrix = function matrix_storeBlockInMatrix(block, x, y) {
              var cellX = (x/ballWidth) | 0;
              var cellY = (y/ballHeight) | 0;
              var array = matrix[cellX+','+cellY];
              // If cell is empty, initialze it
              if(!array) {
                matrix[cellX+','+cellY] = array = [];
              }

              // If block is not already added, then add it to the list
              if(array.indexOf(block)===-1) {
                array.push(block);
              }
          };

          // Find first block which crosses given rectangle or null
          matrix.blockAtSpot = function matrix_blockAtSpot(x, y) {
            var cellX = (x/ballWidth) | 0;
            var cellY = (y/ballHeight) | 0;
            var blocks = [].concat(
              this[cellX+','+cellY],
              this[(cellX+1)+','+cellY],
              this[cellX+','+(cellY+1)],
              this[(cellX+1)+','+(cellY+1)]
            );

            for(var index=0; index < blocks.length; index++) {
                var block=blocks[index];
                if(block && block.isVisible()) {

                    if(x+ballWidth < block.x)
                      continue;
                    if(x > block.x+block.width)
                      continue;
                    if(y+ballHeight < block.y)
                      continue;
                    if(y > block.y+block.height)
                      continue;

                    return block;
                }
            }
            return null;
          }

          // Store links to blocks in matrix
          for(var i=0; i<blocks.length; i++) {
              var block=blocks[i];
              // Store block at corners position
              matrix.storeBlockInMatrix(block, block.x, block.y); // Top left corner
              matrix.storeBlockInMatrix(block, block.x+block.width, block.y); // Top right corner
              matrix.storeBlockInMatrix(block, block.x, block.y+block.height); // Bottom left corner
              matrix.storeBlockInMatrix(block, block.x+block.width, block.y+block.height); // Bottom right corner

              if(block.width>ballWidth*2) {
                // Block is too wide, so ball can slip trough
                // Store additional coordinates
                for(var ix=block.x+ballWidth; ix<block.x+block.width-ballWidth; ix+=ballWidth) {
                  matrix.storeBlockInMatrix(block, ix, block.y); // Top side
                  matrix.storeBlockInMatrix(block, ix, block.y+block.height); // Bottom side
                }
              }
              if(block.height>ballHeight*2) {
                // Block is too high, so ball can slip trough
                // Store additional coordinates
                for(var iy=block.y+ballHeight; iy<block.y+block.height-ballHeight; iy+=ballHeight) {
                  matrix.storeBlockInMatrix(block, block.x, iy); // Left side
                  matrix.storeBlockInMatrix(block, block.x+block.width, iy); // Right side
                }
              }
          }

          return matrix;
        }

        // Move platform when mouse moves
        field.onmousemove = function(cursor) { // mouse
                platformX = cursor.clientX - fieldX - platformWidth/2;

                // Stop platform at field borders
                if(platformX < 0) {
                  platformX = 0;
                }
                if(platformX + platformWidth > fieldWidth) {
                  platformX = fieldWidth - platformWidth;
                }
        };

        // Launch ball on mouse click
        field.onclick = function(e) {
            if (!launched) {
                launched = true;
            }
        };

        // Return square of distance from ball center to inersection with horizontal plane.
        function distance(velocityY, velocityX, ballX, ballY, planeY) {
          // y := a*x + b
          // a := dy/dx
          // b := y1 - a*x1
          // x := (y - b)/a

          var a = velocityY/velocityX;
          var x1 = ballX-velocityX+ballRadius;
          var y1 = ballY-velocityY+ballRadius;
          var b = y1 - a*x1;
          var planeX = (planeY - b)/a;
          var dx = planeX - x1;
          var dy = planeY - y1;
          return dx*dx + dy*dy;
        }

        function updateModel() {
            var time = new Date().getTime();
            var delta = time - prevTime;
            prevTime = time;
            if(delta > 2*1000/frameRate) {
              delta = 2*1000/frameRate;
            }

            if(!launched) {
                // Set velocity to randomize launch angle
                velocityX = Math.sin(++frameCount/frameRate)*3;
                velocityY = -3;

                // Move ball with platform when it is not launched
                ballX = platformX + platformWidth/2 - ballWidth/2 + (velocityX/3)*((platformWidth-ballWidth)/2);
                ballY = platformY - ballHeight;
            }

            if (launched) {
                // Increase velocity a bit over time
                velocityX*=(1+delta/300000);
                velocityY*=(1+delta/300000);

                // Move ball
                ballX += (velocityX * delta) / 5;
                ballY += (velocityY * delta) / 5;

                // Check is ball hit left wall
                if (ballX < 0)
                    velocityX = Math.abs(velocityX);
                // Check is ball hit top wall
                if (ballY < 0)
                    velocityY = Math.abs(velocityY);

                // Check is ball hit right wall
                if (ballX + ballWidth > fieldWidth) {
                    velocityX = -Math.abs(velocityX);
                }

                // Check is ball hit bottom
                if (ballY + ballHeight > fieldHeight) {
                    launched = false;
                    lives--;
                    livesDiv.innerHTML = "Lives: " + lives;
                }

                // Check is ball hit platform
                if (ballY + ballHeight > platformY
                    && ballY < platformY + platformHeight
                    && ballX + ballWidth > platformX
                    && ballX < platformX + platformWidth) {
                    velocityY = -Math.abs(velocityY);
                    // Change velocity by X relative to point of platform which is hit
                    velocityX += 3*Math.sin((((ballX + ballWidth/2) - (platformX + platformWidth/2))/platformWidth)*1.552);
                }

                // Check is ball hit a block
                var block = blocksMatrix.blockAtSpot(ballX, ballY);
                if(block) {
                    block.hit();

                    // Calculate distance to intesection of ball side with nearest
                    // vertical plane from center of previous ball position
                    var distanceX = 0;
                    if(velocityX<0) {
                      // From right to left, use right side of the block, rotate coordinate system by 90
                      distanceX = distance(velocityX, velocityY, ballY, ballX, block.x+block.width+ballRadius);
                    } else {
                      // From left to right, use left side of the block, rotate coordinate system by 90
                      distanceX = distance(velocityX, velocityY, ballY, ballX, block.x+ballRadius);
                    }

                    // Calculate distance to intesection of ball side with nearest
                    // horizontal plane from center of previous ball position
                    var distanceY = 0;
                    if(velocityY<0) {
                      // From bottom to up, use bottom side of the block
                      distanceY = distance(velocityY, velocityX, ballX, ballY, block.y+block.height+ballRadius);
                    } else {
                      // From up to bottom, use top side of the block
                      distanceY = distance(velocityY, velocityX, ballX, ballY, block.y-ballRadius);
                    }

                    if(distanceX<distanceY) {
                      // Ball touched vertical side first
                      velocityX = -velocityX;
                    } else {
                      // Ball touched horizontal side first
                      velocityY = -velocityY;
                    }

                    points++;
                    pointsDiv.innerHTML = "Points: " + points;
                }
            }

            if (lives === 0) {
                endGame("You LOST", false);
            }
            if (blocksCount <= 0) {
                endGame("You WIN", true);
            }
        }

        function endGame(title,win) {
            // Stop loop
            loop = false;

            // Display dialog
            $(dialogDiv).show();
            displayDiv.innerHTML = title;
            if(win) {
              $(restartDiv).hide();
              $(nextLevelDiv).show();
            } else {
              $(restartDiv).show();
              $(nextLevelDiv).hide();
            }
        }

        var fps_prevTime = 0;
        var fps_frameCount = 0;
        function displayFrameRate() {
          if(frameRateDiv) {
            var currentTime = new Date().getTime();
            var delta = (currentTime - fps_prevTime) | 0;
            var fps = (fps_frameCount * 1000/ delta) | 0;
            fps_prevTime = currentTime;
            fps_frameCount = 0;

            frameRateDiv.innerHTML = 'FPS: '+fps;
          }
        }

        function render() {
          platform.style.left = (platformX | 0) + "px";
          ball.style.left = (ballX | 0) + "px";
          ball.style.top = (ballY | 0)+ "px";
        }

        function game_loop() {
            if(((++fps_frameCount)%100) == 0) {
              displayFrameRate();
            }

            updateModel();
            render();
            if(loop) {
              requestAnimFrame(game_loop, field);
            }
        }

        (function start() {
          if(!loop) {
            levelInfoDiv.innerHTML = "Level: "+level;
            livesDiv.innerHTML = "Lives: " +lives;
            pointsDiv.innerHTML = "Points: "+points;

            // Enable loop
            loop = true;
            // Store start time for FPS display
            fps_prevTime = new Date().getTime();
            fps_frameCount = 0;

            game_loop();
          }
        })();

        function restart(nextLevel) {
          // Reset blocks, so they are visible again
          for(var i=0; i<blocks.length; i++) {
            blocks[i].show();
          }

          console.log(1);

          // Hide dialog
          $(dialogDiv).hide();

          // Start game again at given level (if any) and keep points and lives
          initGame(nextLevel || 1, nextLevel? points : 0, nextLevel? lives : 3);
        }

        function nextLevel() {
          restart(level+1);
        }

        // Export
        window.restart = function () { loop=false; window.setTimeout(restart, 300); };
        window.nextLevel = function () { loop=false; window.setTimeout(nextLevel, 300); };

    })(0, 0, 3); // Start game from level 1, with 0 points and 3 lives, see also restart()
