        // Initialize Lucide Icons
        lucide.createIcons();

        // --- THREE.JS SETUP ---
        const container = document.getElementById('canvas-container');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e1e1e); // Match UI background
        scene.fog = new THREE.Fog(0x1e1e1e, 20, 100);

        // Camera
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(15, 15, 20);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        // The canvas size will be managed via the resize event accurately
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // OrbitControls
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't allow going too far below ground

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x90b0d0, 0.4);
        fillLight.position.set(-10, 10, -10);
        scene.add(fillLight);

        // Environment / Grid
        const gridHelper = new THREE.GridHelper(50, 50, 0x3e3e3e, 0x2b2b2b);
        scene.add(gridHelper);

        // Group to hold our generated CAD meshes
        const cadGroup = new THREE.Group();
        scene.add(cadGroup);

        // Animation Loop
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        // Handle Window Resize
        function onWindowResize() {
            // Get dimensions from the container div instead of window
            const width = container.clientWidth;
            const height = container.clientHeight;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }
        window.addEventListener('resize', onWindowResize);
        
        // Call once to set initial size
        onWindowResize();

        // --- CAD ENGINE LOGIC ---
        // Global State
        let messages = [];
        let currentModelJSON = null;
        let currentViewMode = 'default'; // 'default', 'stress', 'heat'

        // Helper for Heatmap Colors (0 to 1 value)
        function getHeatmapColor(value) {
            // value 0 to 1
            // 0 -> Blue (240 hue), 0.5 -> Green/Yellow, 1 -> Red (0 hue)
            const h = (1.0 - value) * 240;
            return new THREE.Color(`hsl(${h}, 100%, 50%)`);
        }

        // Function to build Three.js shapes from JSON schema
        function buildModelFromJSON(shapes) {
            // Clear existing models
            while(cadGroup.children.length > 0){ 
                const child = cadGroup.children[0];
                cadGroup.remove(child);
                if(child.geometry) child.geometry.dispose();
                if(child.material) child.material.dispose();
            }

            shapes.forEach(shape => {
                let geometry;
                // Parse color, default to grey if invalid
                const matColor = shape.color || '#888888';
                let finalColor = new THREE.Color(matColor);
                
                if (currentViewMode === 'stress' && shape.stress !== undefined) {
                    finalColor = getHeatmapColor(shape.stress);
                } else if (currentViewMode === 'heat' && shape.heat !== undefined) {
                    finalColor = getHeatmapColor(shape.heat);
                }

                const material = new THREE.MeshStandardMaterial({ 
                    color: finalColor,
                    roughness: 0.3,
                    metalness: 0.2,
                    side: shape.type.toLowerCase() === 'plane' ? THREE.DoubleSide : THREE.FrontSide
                });

                switch(shape.type.toLowerCase()) {
                    case 'box':
                        geometry = new THREE.BoxGeometry(
                            shape.width || 1, 
                            shape.height || 1, 
                            shape.depth || 1
                        );
                        break;
                    case 'sphere':
                        geometry = new THREE.SphereGeometry(
                            shape.radius || 1, 
                            32, 16
                        );
                        break;
                    case 'cylinder':
                        geometry = new THREE.CylinderGeometry(
                            shape.radiusTop !== undefined ? shape.radiusTop : 1, 
                            shape.radiusBottom !== undefined ? shape.radiusBottom : 1, 
                            shape.height || 2, 
                            32
                        );
                        break;
                    case 'cone':
                        geometry = new THREE.ConeGeometry(
                            shape.radius || 1,
                            shape.height || 2,
                            32
                        );
                        break;
                    case 'torus':
                        geometry = new THREE.TorusGeometry(
                            shape.radius || 1,
                            shape.tube || 0.4,
                            16,
                            100
                        );
                        break;
                    case 'torusknot':
                        geometry = new THREE.TorusKnotGeometry(
                            shape.radius || 1,
                            shape.tube || 0.4,
                            100,
                            16
                        );
                        break;
                    case 'plane':
                        geometry = new THREE.PlaneGeometry(
                            shape.width || 1,
                            shape.height || 1
                        );
                        break;
                    default:
                        console.warn('Unknown shape type:', shape.type);
                        return; // skip unknown
                }

                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                // Set Position
                mesh.position.set(
                    shape.x || 0,
                    shape.y || 0,
                    shape.z || 0
                );

                // Set Rotation (convert degrees to radians)
                if (shape.rotationX) mesh.rotation.x = THREE.MathUtils.degToRad(shape.rotationX);
                if (shape.rotationY) mesh.rotation.y = THREE.MathUtils.degToRad(shape.rotationY);
                if (shape.rotationZ) mesh.rotation.z = THREE.MathUtils.degToRad(shape.rotationZ);

                cadGroup.add(mesh);
            });
            
            // Center the entire group so it rests on the floor at Y=0 and is centered at X=0, Z=0
            const box = new THREE.Box3().setFromObject(cadGroup);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            cadGroup.position.x = -center.x;
            cadGroup.position.z = -center.z;
            cadGroup.position.y = -box.min.y; // Ensure bottom touches the floor grid
            
            // Adjust camera to fit the new object
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 2.0; // zoom out a little
            
            // Clamp the maximum zoom out distance so it doesn't get crazy far for scattered/large models
            cameraZ = Math.min(cameraZ, 60);
            
            // Re-calculate the center after moving the group
            const newBox = new THREE.Box3().setFromObject(cadGroup);
            const newCenter = newBox.getCenter(new THREE.Vector3());
            
            camera.position.set(newCenter.x + cameraZ * 0.5, newCenter.y + cameraZ * 0.5, newCenter.z + cameraZ);
            controls.target.copy(newCenter);
        }

        // Generate Sample Object on Load
        const sampleEngine = [{"type": "cylinder", "radiusTop": 0.4, "radiusBottom": 0.4, "height": 14, "x": 0, "y": 5, "z": 0, "rotationX": 90, "color": "#52525b"}, {"type": "cone", "radius": 1.2, "height": 2.5, "x": 0, "y": 5, "z": 6.5, "rotationX": -90, "color": "#d4d4d8"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": 1.8, "y": 5.0, "z": 5.5, "rotationZ": 0.0, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": 1.662983158520316, "y": 5.688830178257161, "z": 5.5, "rotationZ": 22.5, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": 1.2727922061357857, "y": 6.272792206135786, "z": 5.5, "rotationZ": 45.0, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": 0.6888301782571618, "y": 6.662983158520316, "z": 5.5, "rotationZ": 67.5, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": 1.1021821192326179e-16, "y": 6.8, "z": 5.5, "rotationZ": 90.0, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": -0.6888301782571615, "y": 6.662983158520316, "z": 5.5, "rotationZ": 112.5, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": -1.2727922061357855, "y": 6.272792206135786, "z": 5.5, "rotationZ": 135.0, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": -1.662983158520316, "y": 5.688830178257162, "z": 5.5, "rotationZ": 157.5, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": -1.8, "y": 5.0, "z": 5.5, "rotationZ": 180.0, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": -1.6629831585203163, "y": 4.311169821742839, "z": 5.5, "rotationZ": 202.5, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": -1.272792206135786, "y": 3.7272077938642143, "z": 5.5, "rotationZ": 225.0, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": -0.6888301782571611, "y": 3.3370168414796835, "z": 5.5, "rotationZ": 247.5, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": -3.3065463576978537e-16, "y": 3.2, "z": 5.5, "rotationZ": 270.0, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": 0.688830178257162, "y": 3.3370168414796844, "z": 5.5, "rotationZ": 292.5, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": 1.2727922061357853, "y": 3.7272077938642143, "z": 5.5, "rotationZ": 315.0, "rotationX": 15, "color": "#a1a1aa"}, {"type": "box", "width": 2.8, "height": 0.1, "depth": 0.6, "x": 1.6629831585203163, "y": 4.311169821742839, "z": 5.5, "rotationZ": 337.5, "rotationX": 15, "color": "#a1a1aa"}, {"type": "torus", "radius": 3.4, "tube": 0.2, "x": 0, "y": 5, "z": 5.5, "color": "#3f3f46"}, {"type": "torus", "radius": 3.4, "tube": 0.2, "x": 0, "y": 5, "z": 4.5, "color": "#3f3f46"}, {"type": "torus", "radius": 3.4, "tube": 0.2, "x": 0, "y": 5, "z": 3.5, "color": "#3f3f46"}, {"type": "cylinder", "radiusTop": 3.6, "radiusBottom": 3.6, "height": 3, "x": 0, "y": 5, "z": 4.5, "rotationX": 90, "color": "#e4e4e7"}, {"type": "torus", "radius": 2.2, "tube": 0.1, "x": 0, "y": 5, "z": 2.5, "color": "#52525b"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": 1.2000000000000002, "y": 5.0, "z": 2.5, "rotationZ": 0.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": 1.0392304845413265, "y": 5.6, "z": 2.5, "rotationZ": 30.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": 0.6000000000000002, "y": 6.039230484541326, "z": 2.5, "rotationZ": 60.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": 7.34788079488412e-17, "y": 6.2, "z": 2.5, "rotationZ": 90.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": -0.5999999999999999, "y": 6.039230484541326, "z": 2.5, "rotationZ": 120.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": -1.0392304845413265, "y": 5.6, "z": 2.5, "rotationZ": 150.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": -1.2000000000000002, "y": 5.0, "z": 2.5, "rotationZ": 180.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": -1.0392304845413265, "y": 4.3999999999999995, "z": 2.5, "rotationZ": 210.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": -0.6000000000000006, "y": 3.960769515458674, "z": 2.5, "rotationZ": 240.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": -2.204364238465236e-16, "y": 3.8, "z": 2.5, "rotationZ": 270.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": 0.6000000000000002, "y": 3.9607695154586735, "z": 2.5, "rotationZ": 300.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.6, "height": 0.05, "depth": 0.3, "x": 1.0392304845413263, "y": 4.3999999999999995, "z": 2.5, "rotationZ": 330.0, "rotationX": 20, "color": "#71717a"}, {"type": "torus", "radius": 2.0500000000000003, "tube": 0.1, "x": 0, "y": 5, "z": 1.5, "color": "#52525b"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": 1.125, "y": 5.0, "z": 1.5, "rotationZ": 0.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": 1.0135899763902216, "y": 5.488119206507253, "z": 1.5, "rotationZ": 25.714285714285715, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": 0.7014260270910753, "y": 5.879560417776533, "z": 1.5, "rotationZ": 51.42857142857143, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": 0.25033605070085374, "y": 6.096793901204552, "z": 1.5, "rotationZ": 77.14285714285714, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": -0.25033605070085363, "y": 6.096793901204552, "z": 1.5, "rotationZ": 102.85714285714286, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": -0.7014260270910755, "y": 5.879560417776533, "z": 1.5, "rotationZ": 128.57142857142858, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": -1.0135899763902214, "y": 5.488119206507253, "z": 1.5, "rotationZ": 154.28571428571428, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": -1.125, "y": 5.0, "z": 1.5, "rotationZ": 180.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": -1.0135899763902216, "y": 4.511880793492748, "z": 1.5, "rotationZ": 205.71428571428572, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": -0.7014260270910754, "y": 4.120439582223467, "z": 1.5, "rotationZ": 231.42857142857144, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": -0.2503360507008529, "y": 3.903206098795448, "z": 1.5, "rotationZ": 257.14285714285717, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": 0.25033605070085446, "y": 3.9032060987954487, "z": 1.5, "rotationZ": 282.8571428571429, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": 0.701426027091075, "y": 4.120439582223466, "z": 1.5, "rotationZ": 308.57142857142856, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.4500000000000002, "height": 0.05, "depth": 0.3, "x": 1.0135899763902214, "y": 4.511880793492747, "z": 1.5, "rotationZ": 334.2857142857143, "rotationX": 20, "color": "#71717a"}, {"type": "torus", "radius": 1.9, "tube": 0.1, "x": 0, "y": 5, "z": 0.5, "color": "#52525b"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": 1.0499999999999998, "y": 5.0, "z": 0.5, "rotationZ": 0.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": 0.9700735091368509, "y": 5.4018176039833445, "z": 0.5, "rotationZ": 22.5, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": 0.7424621202458749, "y": 5.742462120245875, "z": 0.5, "rotationZ": 45.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": 0.40181760398334426, "y": 5.970073509136851, "z": 0.5, "rotationZ": 67.5, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": 6.429395695523604e-17, "y": 6.05, "z": 0.5, "rotationZ": 90.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": -0.40181760398334415, "y": 5.970073509136851, "z": 0.5, "rotationZ": 112.5, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": -0.7424621202458747, "y": 5.742462120245875, "z": 0.5, "rotationZ": 135.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": -0.9700735091368509, "y": 5.4018176039833445, "z": 0.5, "rotationZ": 157.5, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": -1.0499999999999998, "y": 5.0, "z": 0.5, "rotationZ": 180.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": -0.970073509136851, "y": 4.5981823960166555, "z": 0.5, "rotationZ": 202.5, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": -0.742462120245875, "y": 4.257537879754126, "z": 0.5, "rotationZ": 225.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": -0.40181760398334393, "y": 4.029926490863149, "z": 0.5, "rotationZ": 247.5, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": -1.9288187086570809e-16, "y": 3.95, "z": 0.5, "rotationZ": 270.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": 0.40181760398334443, "y": 4.029926490863149, "z": 0.5, "rotationZ": 292.5, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": 0.7424621202458745, "y": 4.257537879754125, "z": 0.5, "rotationZ": 315.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.2999999999999998, "height": 0.05, "depth": 0.3, "x": 0.970073509136851, "y": 4.598182396016656, "z": 0.5, "rotationZ": 337.5, "rotationX": 20, "color": "#71717a"}, {"type": "torus", "radius": 1.75, "tube": 0.1, "x": 0, "y": 5, "z": -0.5, "color": "#52525b"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.975, "y": 5.0, "z": -0.5, "rotationZ": 0.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.9162003052662607, "y": 5.3334696397425265, "z": -0.5, "rotationZ": 20.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.7468933320410035, "y": 5.626717919444376, "z": -0.5, "rotationZ": 40.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.4875000000000001, "y": 5.8443747686898275, "z": -0.5, "rotationZ": 60.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.16930697322525715, "y": 5.9601875591869025, "z": -0.5, "rotationZ": 80.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.16930697322525703, "y": 5.9601875591869025, "z": -0.5, "rotationZ": 100.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.48749999999999977, "y": 5.8443747686898275, "z": -0.5, "rotationZ": 120.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.7468933320410034, "y": 5.626717919444376, "z": -0.5, "rotationZ": 140.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.9162003052662606, "y": 5.333469639742527, "z": -0.5, "rotationZ": 160.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.975, "y": 5.0, "z": -0.5, "rotationZ": 180.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.9162003052662607, "y": 4.6665303602574735, "z": -0.5, "rotationZ": 200.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.7468933320410035, "y": 4.373282080555624, "z": -0.5, "rotationZ": 220.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.48750000000000043, "y": 4.1556252313101725, "z": -0.5, "rotationZ": 240.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": -0.16930697322525706, "y": 4.0398124408130975, "z": -0.5, "rotationZ": 260.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.16930697322525673, "y": 4.0398124408130975, "z": -0.5, "rotationZ": 280.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.4875000000000001, "y": 4.1556252313101725, "z": -0.5, "rotationZ": 300.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.7468933320410033, "y": 4.373282080555624, "z": -0.5, "rotationZ": 320.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 1.15, "height": 0.05, "depth": 0.3, "x": 0.9162003052662607, "y": 4.6665303602574735, "z": -0.5, "rotationZ": 340.0, "rotationX": 20, "color": "#71717a"}, {"type": "torus", "radius": 1.5999999999999999, "tube": 0.1, "x": 0, "y": 5, "z": -1.5, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.8999999999999999, "y": 5.0, "z": -1.5, "rotationZ": 0.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.8559508646656381, "y": 5.278115294937453, "z": -1.5, "rotationZ": 18.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.7281152949374526, "y": 5.5290067270632255, "z": -1.5, "rotationZ": 36.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.5290067270632258, "y": 5.728115294937453, "z": -1.5, "rotationZ": 54.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.2781152949374527, "y": 5.855950864665638, "z": -1.5, "rotationZ": 72.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 5.510910596163089e-17, "y": 5.9, "z": -1.5, "rotationZ": 90.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.2781152949374526, "y": 5.855950864665639, "z": -1.5, "rotationZ": 108.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.5290067270632257, "y": 5.728115294937453, "z": -1.5, "rotationZ": 126.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.7281152949374525, "y": 5.5290067270632255, "z": -1.5, "rotationZ": 144.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.8559508646656381, "y": 5.278115294937453, "z": -1.5, "rotationZ": 162.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.8999999999999999, "y": 5.0, "z": -1.5, "rotationZ": 180.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.8559508646656382, "y": 4.721884705062547, "z": -1.5, "rotationZ": 198.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.7281152949374526, "y": 4.4709932729367745, "z": -1.5, "rotationZ": 216.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.5290067270632258, "y": 4.271884705062547, "z": -1.5, "rotationZ": 234.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.2781152949374528, "y": 4.144049135334362, "z": -1.5, "rotationZ": 252.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -1.6532731788489266e-16, "y": 4.1, "z": -1.5, "rotationZ": 270.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.27811529493745246, "y": 4.144049135334361, "z": -1.5, "rotationZ": 288.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.5290067270632256, "y": 4.271884705062547, "z": -1.5, "rotationZ": 306.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.7281152949374525, "y": 4.470993272936774, "z": -1.5, "rotationZ": 324.0, "rotationX": 20, "color": "#71717a"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.8559508646656381, "y": 4.721884705062547, "z": -1.5, "rotationZ": 342.0, "rotationX": 20, "color": "#71717a"}, {"type": "sphere", "radius": 1.8, "x": 0, "y": 5, "z": -2.5, "color": "#9a3412"}, {"type": "torus", "radius": 1.9, "tube": 0.1, "x": 0, "y": 5, "z": -2.5, "color": "#3f3f46"}, {"type": "torus", "radius": 1.8, "tube": 0.1, "x": 0, "y": 5, "z": -1.5, "color": "#3f3f46"}, {"type": "torus", "radius": 1.8, "tube": 0.1, "x": 0, "y": 5, "z": -3.5, "color": "#3f3f46"}, {"type": "torus", "radius": 1.5999999999999999, "tube": 0.1, "x": 0, "y": 5, "z": -4.5, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.8999999999999999, "y": 5.0, "z": -4.5, "rotationZ": 0.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.8314915792601579, "y": 5.344415089128581, "z": -4.5, "rotationZ": 22.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.6363961030678927, "y": 5.636396103067892, "z": -4.5, "rotationZ": 45.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.3444150891285808, "y": 5.831491579260158, "z": -4.5, "rotationZ": 67.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 5.510910596163089e-17, "y": 5.9, "z": -4.5, "rotationZ": 90.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.3444150891285807, "y": 5.831491579260158, "z": -4.5, "rotationZ": 112.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.6363961030678926, "y": 5.636396103067892, "z": -4.5, "rotationZ": 135.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.8314915792601579, "y": 5.344415089128581, "z": -4.5, "rotationZ": 157.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.8999999999999999, "y": 5.0, "z": -4.5, "rotationZ": 180.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.831491579260158, "y": 4.655584910871419, "z": -4.5, "rotationZ": 202.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.6363961030678928, "y": 4.363603896932108, "z": -4.5, "rotationZ": 225.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -0.34441508912858054, "y": 4.168508420739842, "z": -4.5, "rotationZ": 247.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": -1.6532731788489266e-16, "y": 4.1, "z": -4.5, "rotationZ": 270.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.344415089128581, "y": 4.168508420739842, "z": -4.5, "rotationZ": 292.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.6363961030678925, "y": 4.363603896932107, "z": -4.5, "rotationZ": 315.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 0.9999999999999999, "height": 0.05, "depth": 0.3, "x": 0.831491579260158, "y": 4.655584910871419, "z": -4.5, "rotationZ": 337.5, "rotationX": -20, "color": "#52525b"}, {"type": "torus", "radius": 1.7999999999999998, "tube": 0.1, "x": 0, "y": 5, "z": -5.3, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": 0.9999999999999999, "y": 5.0, "z": -5.3, "rotationZ": 0.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": 0.9238795325112866, "y": 5.38268343236509, "z": -5.3, "rotationZ": 22.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": 0.7071067811865475, "y": 5.707106781186548, "z": -5.3, "rotationZ": 45.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": 0.3826834323650898, "y": 5.923879532511287, "z": -5.3, "rotationZ": 67.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": 6.123233995736765e-17, "y": 6.0, "z": -5.3, "rotationZ": 90.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": -0.38268343236508967, "y": 5.923879532511287, "z": -5.3, "rotationZ": 112.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": -0.7071067811865474, "y": 5.707106781186548, "z": -5.3, "rotationZ": 135.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": -0.9238795325112866, "y": 5.38268343236509, "z": -5.3, "rotationZ": 157.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": -0.9999999999999999, "y": 5.0, "z": -5.3, "rotationZ": 180.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": -0.9238795325112867, "y": 4.61731656763491, "z": -5.3, "rotationZ": 202.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": -0.7071067811865476, "y": 4.292893218813453, "z": -5.3, "rotationZ": 225.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": -0.38268343236508945, "y": 4.076120467488713, "z": -5.3, "rotationZ": 247.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": -1.8369701987210294e-16, "y": 4.0, "z": -5.3, "rotationZ": 270.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": 0.38268343236508995, "y": 4.076120467488714, "z": -5.3, "rotationZ": 292.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": 0.7071067811865472, "y": 4.292893218813452, "z": -5.3, "rotationZ": 315.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.1999999999999997, "height": 0.05, "depth": 0.3, "x": 0.9238795325112867, "y": 4.61731656763491, "z": -5.3, "rotationZ": 337.5, "rotationX": -20, "color": "#52525b"}, {"type": "torus", "radius": 1.9999999999999998, "tube": 0.1, "x": 0, "y": 5, "z": -6.1, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": 1.1, "y": 5.0, "z": -6.1, "rotationZ": 0.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": 1.0162674857624154, "y": 5.420951775601599, "z": -6.1, "rotationZ": 22.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": 0.7778174593052024, "y": 5.7778174593052025, "z": -6.1, "rotationZ": 45.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": 0.42095177560159885, "y": 6.016267485762415, "z": -6.1, "rotationZ": 67.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": 6.735557395310444e-17, "y": 6.1, "z": -6.1, "rotationZ": 90.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": -0.42095177560159874, "y": 6.016267485762415, "z": -6.1, "rotationZ": 112.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": -0.7778174593052023, "y": 5.7778174593052025, "z": -6.1, "rotationZ": 135.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": -1.0162674857624154, "y": 5.420951775601599, "z": -6.1, "rotationZ": 157.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": -1.1, "y": 5.0, "z": -6.1, "rotationZ": 180.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": -1.0162674857624157, "y": 4.579048224398401, "z": -6.1, "rotationZ": 202.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": -0.7778174593052025, "y": 4.2221825406947975, "z": -6.1, "rotationZ": 225.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": -0.42095177560159847, "y": 3.9837325142375843, "z": -6.1, "rotationZ": 247.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": -2.0206672185931328e-16, "y": 3.9, "z": -6.1, "rotationZ": 270.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": 0.420951775601599, "y": 3.983732514237585, "z": -6.1, "rotationZ": 292.5, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": 0.7778174593052022, "y": 4.2221825406947975, "z": -6.1, "rotationZ": 315.0, "rotationX": -20, "color": "#52525b"}, {"type": "box", "width": 1.4, "height": 0.05, "depth": 0.3, "x": 1.0162674857624157, "y": 4.579048224398401, "z": -6.1, "rotationZ": 337.5, "rotationX": -20, "color": "#52525b"}, {"type": "cylinder", "radiusTop": 1.2, "radiusBottom": 1.8, "height": 2, "x": 0, "y": 5, "z": -7.5, "rotationX": 90, "color": "#3f3f46"}, {"type": "cone", "radius": 0.6, "height": 2, "x": 0, "y": 5, "z": -7.5, "rotationX": 90, "color": "#52525b"}];
        buildModelFromJSON(sampleEngine);
        currentModelJSON = { "shapes": sampleEngine };

        // --- UI & API INTERACTION ---

        const promptInput = document.getElementById('promptInput');
        const apiKeyInput = document.getElementById('apiKey');
        const generateBtn = document.getElementById('generateBtn');
        const chatHistory = document.getElementById('chatHistory');
        const outlinerShapes = document.getElementById('outliner-shapes');
        const propertiesPanel = document.getElementById('propertiesPanel');

        // --- TOOLBAR LOGIC ---
        const btnViewDefault = document.getElementById('btn-view-default');
        const btnViewStress = document.getElementById('btn-view-stress');
        const btnViewHeat = document.getElementById('btn-view-heat');

        function updateToolbarUI() {
            btnViewDefault.className = 'p-1.5 text-gray-400 rounded hover:bg-[#3e3e3e] transition-colors';
            btnViewStress.className = 'p-1.5 text-gray-400 rounded hover:bg-[#3e3e3e] hover:text-red-400 transition-colors';
            btnViewHeat.className = 'p-1.5 text-gray-400 rounded hover:bg-[#3e3e3e] hover:text-orange-400 transition-colors';

            if (currentViewMode === 'default') {
                btnViewDefault.classList.add('bg-[#323232]', 'text-[#4d90fe]');
                btnViewDefault.classList.remove('text-gray-400');
            } else if (currentViewMode === 'stress') {
                btnViewStress.classList.add('bg-[#323232]', 'text-red-400');
                btnViewStress.classList.remove('text-gray-400');
            } else if (currentViewMode === 'heat') {
                btnViewHeat.classList.add('bg-[#323232]', 'text-orange-400');
                btnViewHeat.classList.remove('text-gray-400');
            }
            
            if (currentModelJSON && currentModelJSON.shapes) {
                buildModelFromJSON(currentModelJSON.shapes);
            }
        }

        btnViewDefault.addEventListener('click', () => {
            currentViewMode = 'default';
            updateToolbarUI();
        });

        btnViewStress.addEventListener('click', () => {
            if (!currentModelJSON) return;
            currentViewMode = 'stress';
            updateToolbarUI();
            
            // Trigger AI analysis if data doesn't exist
            if (!currentModelJSON.shapes[0].hasOwnProperty('stress')) {
                sendMessage("Perform a structural stress analysis on the current model. Add a 'stress' float property (0.0 to 1.0) to EVERY shape in the JSON to represent mechanical strain. Provide an engineering report on the weak points.");
            }
        });

        btnViewHeat.addEventListener('click', () => {
            if (!currentModelJSON) return;
            currentViewMode = 'heat';
            updateToolbarUI();
            
            // Trigger AI analysis if data doesn't exist
            if (!currentModelJSON.shapes[0].hasOwnProperty('heat')) {
                sendMessage("Perform a thermal heat analysis on the current model. Add a 'heat' float property (0.0 to 1.0) to EVERY shape in the JSON to represent temperature distribution. Provide an engineering report on the thermal hotspots.");
            }
        });

        // Handle Example Buttons
        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                promptInput.value = e.target.getAttribute('data-prompt');
                promptInput.focus();
            });
        });

        // Auto-resize textarea and handle enter key
        promptInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value.trim() === '') {
                this.style.height = 'auto'; // Reset on empty
            }
        });

        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                generateBtn.click();
            }
        });
        
        function updateOutliner(shapes) {
            outlinerShapes.innerHTML = '';
            
            shapes.forEach((shape, index) => {
                const item = document.createElement('div');
                item.className = 'flex items-center gap-2 text-gray-400 py-1 hover:bg-[#3e3e3e] hover:text-gray-200 cursor-pointer rounded px-1.5 transition-colors';
                
                // Icon mapping based on shape type
                let iconName = 'box';
                if (shape.type === 'sphere') iconName = 'circle';
                if (shape.type === 'cylinder') iconName = 'cylinder'; // Lucide has cylinder
                if (shape.type === 'cone') iconName = 'triangle';
                if (shape.type === 'torus' || shape.type === 'torusKnot') iconName = 'life-buoy';
                if (shape.type === 'plane') iconName = 'square';

                item.innerHTML = `
                    <i data-lucide="${iconName}" class="w-3.5 h-3.5"></i>
                    <span>${shape.type.charAt(0).toUpperCase() + shape.type.slice(1)}.${index.toString().padStart(3, '0')}</span>
                `;
                
                item.addEventListener('click', () => showProperties(shape, index));
                outlinerShapes.appendChild(item);
            });
            
            lucide.createIcons({ root: outlinerShapes });
        }
        
        function showProperties(shape, index) {
            let html = `<div class="font-bold text-white border-b border-[#3e3e3e] pb-2 mb-3">Object: ${shape.type} (${index})</div>`;
            
            html += `<div class="grid grid-cols-2 gap-2 mb-4">`;
            
            const addProp = (label, value) => {
                html += `
                    <div class="text-gray-500">${label}</div>
                    <div class="text-gray-200 bg-[#1e1e1e] px-2 py-0.5 rounded border border-[#3e3e3e] font-mono truncate" title="${value}">${value}</div>
                `;
            };
            
            // Common props
            if (shape.color) {
                html += `
                    <div class="text-gray-500">Color</div>
                    <div class="flex items-center gap-1 text-gray-200 bg-[#1e1e1e] px-1 py-0.5 rounded border border-[#3e3e3e] font-mono">
                        <div class="w-3 h-3 rounded-full border border-gray-600" style="background-color: ${shape.color}"></div>
                        ${shape.color}
                    </div>
                `;
            }
            
            // Dimensions
            html += `<div class="col-span-2 text-gray-400 mt-2 border-b border-[#3e3e3e] pb-1 mb-1">Dimensions</div>`;
            if (shape.width !== undefined) addProp('Width', shape.width);
            if (shape.height !== undefined) addProp('Height', shape.height);
            if (shape.depth !== undefined) addProp('Depth', shape.depth);
            if (shape.radius !== undefined) addProp('Radius', shape.radius);
            if (shape.radiusTop !== undefined) addProp('Radius Top', shape.radiusTop);
            if (shape.radiusBottom !== undefined) addProp('Radius Bot', shape.radiusBottom);
            if (shape.tube !== undefined) addProp('Tube', shape.tube);
            
            // Transforms
            html += `<div class="col-span-2 text-gray-400 mt-2 border-b border-[#3e3e3e] pb-1 mb-1">Transform</div>`;
            addProp('Location X', shape.x || 0);
            addProp('Location Y', shape.y || 0);
            addProp('Location Z', shape.z || 0);
            
            if (shape.rotationX || shape.rotationY || shape.rotationZ) {
                addProp('Rotation X', `${shape.rotationX || 0}°`);
                addProp('Rotation Y', `${shape.rotationY || 0}°`);
                addProp('Rotation Z', `${shape.rotationZ || 0}°`);
            }
            
            html += `</div>`;
            propertiesPanel.innerHTML = html;
        }

        function appendUserMessage(text) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'flex gap-3 justify-end w-full';
            msgDiv.innerHTML = `
                <div class="bg-[#4d90fe] text-white rounded p-2 text-xs max-w-[85%] shadow-sm">
                    ${text}
                </div>
            `;
            chatHistory.appendChild(msgDiv);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

        function createAIMessageElement() {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'flex gap-3 w-full';
            
            const avatar = document.createElement('div');
            avatar.className = 'w-6 h-6 rounded bg-[#4d90fe]/20 flex items-center justify-center shrink-0 mt-0.5';
            avatar.innerHTML = '<i data-lucide="bot" class="w-3.5 h-3.5 text-[#4d90fe]"></i>';
            
            const contentContainer = document.createElement('div');
            contentContainer.className = 'w-full flex flex-col gap-2 max-w-[85%]';
            
            const thinkingBox = document.createElement('div');
            thinkingBox.className = 'border border-[#3e3e3e] rounded bg-[#252525] overflow-hidden shadow-sm';
            thinkingBox.innerHTML = `
                <div class="flex items-center gap-2 px-2 py-1.5 bg-[#2b2b2b] hover:bg-[#323232] transition-colors cursor-pointer select-none border-b border-[#3e3e3e]" onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.toggle-icon').classList.toggle('rotate-180'); this.classList.toggle('border-b'); this.classList.toggle('border-[#3e3e3e]');">
                    <div class="status-icon-wrapper flex items-center justify-center w-4 h-4">
                        <i data-lucide="loader-2" class="w-3.5 h-3.5 text-[#4d90fe] animate-spin status-icon"></i>
                    </div>
                    <span class="thinking-status text-[11px] font-medium text-gray-300">Initializing...</span>
                    <i data-lucide="chevron-up" class="w-3 h-3 ml-auto text-gray-500 toggle-icon transition-transform duration-200"></i>
                </div>
                <div class="thinking-content px-3 py-2 text-[11px] text-gray-400 bg-[#1e1e1e] whitespace-pre-wrap font-mono leading-relaxed"></div>
            `;
            
            const finalMessage = document.createElement('div');
            finalMessage.className = 'text-xs text-gray-200 hidden leading-relaxed bg-[#1e1e1e] p-2 rounded border border-[#3e3e3e] shadow-sm mt-2';
            
            contentContainer.appendChild(thinkingBox);
            contentContainer.appendChild(finalMessage);
            
            msgDiv.appendChild(avatar);
            msgDiv.appendChild(contentContainer);
            
            chatHistory.appendChild(msgDiv);
            chatHistory.scrollTop = chatHistory.scrollHeight;
            lucide.createIcons({ root: msgDiv });
            
            return { 
                msgDiv, 
                contentContainer, 
                thinkingBox,
                thinkingStatus: thinkingBox.querySelector('.thinking-status'),
                thinkingContent: thinkingBox.querySelector('.thinking-content'),
                finalMessage,
                updateStatus: (text, iconName, colorClass, extraClass = '') => {
                    const statusSpan = thinkingBox.querySelector('.thinking-status');
                    if (statusSpan.textContent !== text) {
                        statusSpan.textContent = text;
                        const wrapper = thinkingBox.querySelector('.status-icon-wrapper');
                        wrapper.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 ${colorClass} ${extraClass} status-icon"></i>`;
                        lucide.createIcons({ root: wrapper });
                    }
                }
            };
        }

        const SYSTEM_PROMPT = `You are an expert 3D CAD engineering AI with deep architectural and spatial reasoning capabilities.
You will chat with the user and help them design 3D objects.
This is a multi-stage interactive engineering pipeline.

CRITICAL RULE: When a user requests a new design, if their prompt is less than 15 words or lacks specific engineering parameters (like dimensions, exact style, or number of components), you MUST NOT generate a JSON model immediately. Instead, you MUST ask them 1 or 2 clarifying questions to narrow down the design.

ENGINEERING ANALYSIS CAPABILITIES:
If the user requests a "stress analysis" or "thermal analysis" on the current model:
1. Do NOT ask questions. Skip to the planning phase.
2. Evaluate the physical properties of the structure (e.g. thin parts bearing weight = high stress, engines = high heat).
3. Output your engineering report in the <think> and Conversational blocks.
4. When outputting the updated JSON, you MUST add a new float property (0.0 to 1.0) to EVERY shape object named either \`stress\` or \`heat\` depending on the request. 0.0 means low, 1.0 means critical.

If you NEED clarification (which you almost always do for short new design prompts):
1. Output <think>...</think> with your internal reasoning about what information is missing.
2. Output a friendly message asking the user for their preference (e.g. "Do you want a quadcopter or hexacopter?"). 
3. STOP. Do not output a JSON block.

If the user HAS PROVIDED enough detailed information (or answered your questions):
1. PLANNING PHASE: First, enclose your internal step-by-step thinking, mathematical calculations, and primitive planning inside <think> ... </think> tags.
   - Calculate exact coordinates. Determine the center of mass. 
   - Calculate exact dimensions so parts fit flush against each other.
   - Verify that if object A is on top of object B, A.y - (A.height/2) == B.y + (B.height/2).
2. CONVERSATIONAL RESPONSE: After the </think> tag, write a brief, friendly message explaining what you have designed or fixed.
3. JSON MODEL: Finally, output the 3D model as a JSON block.

Use ONLY these shape types: "box", "sphere", "cylinder", "cone", "torus", "torusKnot", "plane".

CRITICAL MODELING INSTRUCTIONS:
1. HIGH COMPLEXITY: You MUST use between 10 to 30 primitive shapes to construct highly detailed, intricate objects. Never output simple 3-shape models. Break the object down into micro-components (e.g. A car must have a main body, roof, 4 separate wheels, rims, headlights, taillights, bumpers, windows, and door handles).
2. SPATIAL MATH (CRITICAL): Do the math! If a table is 10 units wide (x=-5 to 5), the legs must be at exactly x=-4.5 and x=4.5. Parts MUST NOT float in the air disconnected. Parts MUST NOT clip through each other unnaturally.
3. GROUNDING: Ensure coordinates make physical sense. Ground objects so their lowest point touches Y=0.
4. ROTATIONS: Use rotationX, rotationY, and rotationZ (in degrees) to angle parts correctly. Default is 0.
5. COLOR: Assign distinct, realistic hex colors to different parts to make the model pop. Do not make everything grey.

The JSON block must be formatted exactly like this:
\`\`\`json
{
  "shapes": [
    { "type": "box", "width": 10, "height": 2, "depth": 5, "x": 0, "y": 1, "z": 0, "rotationX": 0, "rotationY": 0, "rotationZ": 0, "color": "#ff0000" },
    { "type": "torus", "radius": 2, "tube": 0.5, "x": 5, "y": 1, "z": 0, "rotationX": 90, "rotationY": 0, "rotationZ": 0, "color": "#333333" }
  ]
}
\`\`\`
CRITICAL: Ensure your JSON is 100% valid. Every key must have a valid value. Do not leave trailing commas or empty values (e.g., NEVER write "rotationY": , - always use "rotationY": 0, if there is no rotation).`;

        // Helper function to handle sending messages
        async function sendMessage(customPrompt = null) {
            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                alert("Please enter your OpenAI API Key.");
                return;
            }

            const prompt = typeof customPrompt === 'string' ? customPrompt : promptInput.value.trim();
            if (!prompt) return;

            // Append user message
            appendUserMessage(prompt);
            
            // Add to messages history
            if (messages.length === 0) {
                messages.push({ role: "system", content: SYSTEM_PROMPT });
            }
            
            // If we have a current model from previous turns, inject it
            let messageContent = [];
            
            if (currentModelJSON && messages.length > 1) {
                const textPrompt = `Here is the JSON for the CURRENT model on my screen:\n\`\`\`json\n${JSON.stringify(currentModelJSON)}\n\`\`\`\n\nUser Request: ${prompt}\n\nPlease generate the updated JSON.`;
                messageContent.push({ type: "text", text: textPrompt });
            } else {
                messageContent.push({ type: "text", text: prompt });
            }
            
            messages.push({ role: "user", content: messageContent });

            promptInput.value = '';
            promptInput.style.height = 'auto';
            generateBtn.disabled = true;
            promptInput.disabled = true;
            
            const aiMsgEls = createAIMessageElement();
            
            // Define reusable stream handler
            const streamAPI = async (apiMessages, prefixThoughts = "") => {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o",
                        messages: apiMessages,
                        temperature: 1,
                        stream: true
                    })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error?.message || "API request failed");
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let done = false;
                let fullResponse = "";
                let buffer = "";

                while (!done) {
                    const { value, done: readerDone } = await reader.read();
                    done = readerDone;
                    if (value) {
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || "";
                        
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                                const lineStr = line.substring(6);
                                if (!lineStr) continue;
                                
                                try {
                                    const data = JSON.parse(lineStr);
                                    if (data.choices[0].delta.content) {
                                        const textChunk = data.choices[0].delta.content;
                                        fullResponse += textChunk;
                                        
                                        // Update UI dynamically
                                        let thinkText = "";
                                        let chatText = "";
                                        
                                        const thinkMatch = fullResponse.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
                                        if (thinkMatch) {
                                            thinkText = thinkMatch[1].trim();
                                        } else if (!fullResponse.includes("</think>") && !fullResponse.includes("```json")) {
                                            thinkText = fullResponse.trim();
                                        }
                                        
                                        if (fullResponse.includes('</think>')) {
                                            const afterThink = fullResponse.split('</think>')[1];
                                            chatText = afterThink.split('```json')[0].trim();
                                        } else if (!fullResponse.includes('<think>')) {
                                            chatText = fullResponse.split('```json')[0].trim();
                                        }
                                        
                                        aiMsgEls.thinkingContent.textContent = prefixThoughts + thinkText;
                                        
                                        if (chatText) {
                                            aiMsgEls.finalMessage.classList.remove('hidden');
                                            aiMsgEls.finalMessage.innerHTML = chatText.replace(/\n/g, '<br>');
                                        }
                                        
                                        if (fullResponse.includes('```json')) {
                                            aiMsgEls.updateStatus("Generating 3D code...", "code-2", "text-[#4d90fe]", "");
                                        }
                                        chatHistory.scrollTop = chatHistory.scrollHeight;
                                    }
                                } catch (e) {
                                    console.error("Error parsing stream chunk", e, lineStr);
                                }
                            }
                        }
                    }
                }
                return fullResponse;
            };

            try {
                // STAGE 1: Initial Planning & Generation
                aiMsgEls.updateStatus("Stage 1: Planning & drafting...", "loader-2", "text-[#4d90fe]", "animate-spin");
                
                const response1 = await streamAPI(messages, "");
                messages.push({ role: "assistant", content: response1 });
                
                // Parse JSON 1 and render
                const jsonMatch1 = response1.match(/```json\s*([\s\S]*?)\s*```/);
                
                if (!jsonMatch1 || !jsonMatch1[1]) {
                    // No JSON found -> AI is asking a clarification question
                    aiMsgEls.updateStatus("Waiting for clarification...", "help-circle", "text-yellow-400", "");
                    
                    // Re-enable inputs so user can answer
                    generateBtn.disabled = false;
                    promptInput.disabled = false;
                    promptInput.focus();
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                    return; // Halt pipeline here
                }
                
                let cleanJsonStr1 = jsonMatch1[1].replace(/:\s*,/g, ': 0,').replace(/:\s*}/g, ': 0 }').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
                const parsed1 = JSON.parse(cleanJsonStr1);
                
                if (parsed1.shapes && Array.isArray(parsed1.shapes)) {
                    currentModelJSON = parsed1;
                    buildModelFromJSON(parsed1.shapes);
                } else {
                    throw new Error("Invalid shapes array in Stage 1");
                }
                
                // STAGE 2: Visual Review & Refinement
                aiMsgEls.updateStatus("Stage 2: Visually reviewing render...", "eye", "text-[#4d90fe]", "animate-pulse");
                
                // Force a render frame so canvas has the updated image
                renderer.render(scene, camera);
                const dataURL = renderer.domElement.toDataURL('image/jpeg', 0.8);
                
                const reviewPrompt = `I have rendered your initial model. Here is a screenshot of it exactly as it looks.\n\nPlease visually inspect the screenshot. Look closely for:\n1. Floating or disconnected parts\n2. Bad proportions\n3. Unnatural intersections\n4. Objects clipping through the floor (Y=0)\n\nThink about how to fix them, then output the FINAL improved JSON model. DO NOT ask any questions at this stage, just provide the updated JSON.`;
                
                messages.push({
                    role: "user",
                    content: [
                        { type: "text", text: reviewPrompt },
                        { type: "image_url", image_url: { url: dataURL, detail: "low" } }
                    ]
                });
                
                // Append divider to thinking box for stage 2
                const previousThoughts = aiMsgEls.thinkingContent.textContent + "\n\n=== STAGE 2: VISUAL REVIEW ===\n\n";
                aiMsgEls.thinkingContent.textContent = previousThoughts;
                
                const response2 = await streamAPI(messages, previousThoughts);
                messages.push({ role: "assistant", content: response2 });
                
                // Parse JSON 2 and render final
                const jsonMatch2 = response2.match(/```json\s*([\s\S]*?)\s*```/);
                if (!jsonMatch2 || !jsonMatch2[1]) throw new Error("No JSON found in Stage 2");
                
                let cleanJsonStr2 = jsonMatch2[1].replace(/:\s*,/g, ': 0,').replace(/:\s*}/g, ': 0 }').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
                const parsed2 = JSON.parse(cleanJsonStr2);
                
                if (parsed2.shapes && Array.isArray(parsed2.shapes)) {
                    currentModelJSON = parsed2;
                    buildModelFromJSON(parsed2.shapes);
                    
                    // Update thinking box to "Completed"
                    aiMsgEls.updateStatus("Multi-stage plan completed", "check-circle-2", "text-emerald-400", "");
                    
                    // Append success badge to the chat message
                    const badgeHTML = `
                        <div class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[11px] border border-emerald-500/20">
                            <i data-lucide="check-check" class="w-3 h-3"></i> Stage 2 Rendered (${parsed2.shapes.length} components)
                        </div>
                    `;
                    aiMsgEls.finalMessage.innerHTML += badgeHTML;
                    lucide.createIcons({ root: aiMsgEls.finalMessage });
                    
                    // Update Outliner
                    updateOutliner(parsed2.shapes);
                    
                } else {
                    throw new Error("AI returned JSON without 'shapes' array in Stage 2.");
                }

            } catch (error) {
                console.error("CAD Error:", error);
                aiMsgEls.updateStatus("Error occurred", "alert-circle", "text-red-400", "");
                
                aiMsgEls.finalMessage.classList.remove('hidden');
                aiMsgEls.finalMessage.classList.replace('bg-[#1e1e1e]', 'bg-red-900/20');
                aiMsgEls.finalMessage.classList.replace('border-[#3e3e3e]', 'border-red-900/50');
                aiMsgEls.finalMessage.innerHTML = `<div class="text-red-400 text-[11px]">Error: ${error.message}</div>`;
            } finally {
                generateBtn.disabled = false;
                promptInput.disabled = false;
                promptInput.focus();
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
        } // End of sendMessage

        generateBtn.addEventListener('click', () => sendMessage());
    