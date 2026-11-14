const CDN = 'https://' + 'esm.sh/three@0.160.0';
const THREE = await import(CDN + '/es2022/three.mjs');
const { PointerLockControls } = await import(CDN + '/examples/jsm/controls/PointerLockControls.js?target=es2022');
const { GLTFLoader } = await import(CDN + '/examples/jsm/loaders/GLTFLoader.js?target=es2022');

let gameActive = false;
const moveState = { forward: false, backward: false, left: false, right: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// 1. Escena y Cámara
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 150);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2.6, 24);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// 2. Iluminación natural diurna
const hemiLight = new THREE.HemisphereLight(0xffffff, 0xc2a378, 1.4);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff5e4, 1.3);
sunLight.position.set(40, 70, 30);
scene.add(sunLight);

// 3. Controles FPS (RF06)
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const coordsLabel = document.getElementById('debug-coords');

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  gameActive = true;
  try { controls.lock(); } catch (err) {}
});

controls.addEventListener('lock', () => {
  startScreen.classList.add('hidden');
  gameActive = true;
});

controls.addEventListener('unlock', () => {
  if (!document.getElementById('win-screen')?.classList.contains('hidden') ||
      !document.getElementById('gameover-screen')?.classList.contains('hidden')) {
    return;
  }
  startScreen.classList.remove('hidden');
  gameActive = false;
});

// Función auxiliar para normalizar escala y apoyar en Y = 0
function normalizeModel(model, targetSize) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(targetSize / maxDim);

  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
}

// 4. Carga del mapa 3D (RF03)
const gltfLoader = new GLTFLoader();
const mapColliders = [];
let mapGroundY = 1.3; // Altura exacta del suelo del mapa

gltfLoader.load(
  './modelos/map.glb',
  (gltf) => {
    const mapModel = gltf.scene;
    normalizeModel(mapModel, 110);

    mapModel.traverse((child) => {
      if (child.isMesh) {
        if (child.material) {
          child.material.metalness = 0.0;
          child.material.roughness = 0.85;
        }
        mapColliders.push(child);
      }
    });

    scene.add(mapModel);

    // Ajustar altura de zombis, cajas de munición y zona de extracción al piso real
    zombies.forEach(z => z.position.y = mapGroundY);
    ammoBoxes.forEach(b => b.position.y = mapGroundY);
    extractionZone.position.y = mapGroundY + 0.05;

    coordsLabel.textContent = 'Posición X: 0.0 | Z: 24.0';
  }
);

// --- RF01, RF02 & RF06: SISTEMA DE DOS ARMAS EN PRIMERA PERSONA ---
const weapons = {
  1: { name: 'Arma 1: Pistola', ammo: 10, maxAmmo: 15, mesh: null },
  2: { name: 'Arma 2: Rifle', ammo: 14, maxAmmo: 30, mesh: null }
};
let currentWeapon = 1;

function updateWeaponHUD() {
  if (weapons[1].mesh) weapons[1].mesh.visible = (currentWeapon === 1);
  if (weapons[2].mesh) weapons[2].mesh.visible = (currentWeapon === 2);
  document.getElementById('weapon-name').textContent = weapons[currentWeapon].name;
  document.getElementById('ammo-count').textContent = weapons[currentWeapon].ammo;
}

function loadWeapon(slot, path, fallbackColor, rotY, rotZ = 0) {
  const wrapper = new THREE.Group();
  wrapper.position.set(0.35, -0.32, -0.65);
  camera.add(wrapper);
  weapons[slot].mesh = wrapper;

  gltfLoader.load(
    path,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.y = rotY;
      model.rotation.z = rotZ;
      normalizeModel(model, 0.55);
      wrapper.add(model);
      updateWeaponHUD();
    },
    undefined,
    () => {
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.16, 0.5),
        new THREE.MeshStandardMaterial({ color: fallbackColor })
      );
      wrapper.add(fallback);
      updateWeaponHUD();
    }
  );
}

loadWeapon(1, './modelos/arma1.glb', 0x2b2b2b, Math.PI, 0);
loadWeapon(2, './modelos/arma2.glb', 0x2d4c2b, 90 , 0);

// --- RF08: ZONA SEGURA DE EXTRACCIÓN ---
const extractionZone = new THREE.Mesh(
  new THREE.CylinderGeometry(3.2, 3.2, 0.15, 32),
  new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x006622 })
);
extractionZone.position.set(0, mapGroundY + 0.05, -24);
scene.add(extractionZone);

// --- RF02 & RF10: OBJETOS COLECCIONABLES (CAJAS DE MUNICIÓN) ---
const ammoBoxes = [];

function spawnAmmoBox(x, z, amount = 6) {
  const boxGroup = new THREE.Group();
  boxGroup.position.set(x, mapGroundY, z);
  boxGroup.userData = { amount, collected: false };
  scene.add(boxGroup);
  ammoBoxes.push(boxGroup);

  gltfLoader.load(
    './modelos/municion.glb',
    (gltf) => {
      const model = gltf.scene;
      normalizeModel(model, 0.9);
      boxGroup.add(model);
    },
    undefined,
    () => {
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffaa00 })
      );
      fallback.position.y = 0.25;
      boxGroup.add(fallback);
    }
  );
}

spawnAmmoBox(-11, 14, 6);
spawnAmmoBox(11, 2, 8);
spawnAmmoBox(-9, -12, 8);

// --- RF04, RF05 & RF07: ZOMBIS (GLB, DETECCIÓN POR RANGO Y 2 IMPACTOS) ---
const zombies = [];

function spawnZombie(x, z, detectionRange = 18, speed = 3.5) {
  const zombieGroup = new THREE.Group();
  zombieGroup.position.set(x, mapGroundY, z);
  zombieGroup.userData = {
    hp: 2,
    alive: true,
    detectionRange: detectionRange,
    speed: speed
  };

  // Hitbox amplia para detección precisa de disparos (RF07)
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.5, 1.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.y = 1.25;
  zombieGroup.add(hitBox);

  scene.add(zombieGroup);
  zombies.push(zombieGroup);

  gltfLoader.load(
    './modelos/zombi.glb',
    (gltf) => {
      const model = gltf.scene;
      normalizeModel(model, 2.4);
      zombieGroup.add(model);
    },
    undefined,
    () => {
      const fallback = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.5, 1.3, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x4e8c3a })
      );
      fallback.position.y = 1.15;
      zombieGroup.add(fallback);
    }
  );
}

spawnZombie(-12, 10, 16, 3.2);
spawnZombie(12, 6, 16, 3.2);
spawnZombie(0, -4, 18, 3.6);
spawnZombie(-10, -16, 20, 4.0);
spawnZombie(10, -18, 20, 4.0);

// 5. Controles de teclado (RF01 & RF06)
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') moveState.forward = true;
  if (e.code === 'KeyS') moveState.backward = true;
  if (e.code === 'KeyA') moveState.left = true;
  if (e.code === 'KeyD') moveState.right = true;
  if (e.code === 'Digit1') { currentWeapon = 1; updateWeaponHUD(); }
  if (e.code === 'Digit2') { currentWeapon = 2; updateWeaponHUD(); }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') moveState.forward = false;
  if (e.code === 'KeyS') moveState.backward = false;
  if (e.code === 'KeyA') moveState.left = false;
  if (e.code === 'KeyD') moveState.right = false;
});

// --- RF01, RF02 & RF07: DISPARO ÚNICO Y COLISIÓN CON ZOMBIS ---
const shootRaycaster = new THREE.Raycaster();

window.addEventListener('mousedown', (e) => {
  if (!gameActive || e.button !== 0) return;

  const weapon = weapons[currentWeapon];
  if (weapon.ammo <= 0) return;

  weapon.ammo -= 1;
  updateWeaponHUD();

  if (weapon.mesh) {
    weapon.mesh.position.z = -0.55;
    setTimeout(() => { if (weapon.mesh) weapon.mesh.position.z = -0.65; }, 80);
  }

  shootRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const aliveZombies = zombies.filter(z => z.userData.alive);
  const hits = shootRaycaster.intersectObjects(aliveZombies, true);

  if (hits.length > 0) {
    let hitObj = hits[0].object;
    while (hitObj.parent && !hitObj.userData.hasOwnProperty('hp')) {
      hitObj = hitObj.parent;
    }

    if (hitObj.userData && hitObj.userData.alive) {
      hitObj.userData.hp -= 1;

      if (hitObj.userData.hp <= 0) {
        hitObj.userData.alive = false;
        hitObj.visible = false;
      } else {
        // Destello rojo visual en el primer impacto
        hitObj.traverse((c) => {
          if (c.isMesh && c.material && c.material.emissive) {
            c.material.emissive.setHex(0xaa0000);
            setTimeout(() => { if (c.material) c.material.emissive.setHex(0x000000); }, 150);
          }
        });
      }
    }
  }
});

// 6. Colisiones sólidas contra muros y edificios
const wallRaycaster = new THREE.Raycaster();
function checkWallCollision(origin, moveDir) {
  if (mapColliders.length === 0) return false;

  const baseDir = moveDir.clone().setY(0).normalize();
  const angles = [0, 0.6, -0.6];
  const rayOrigin = new THREE.Vector3(origin.x, mapGroundY + 1.0, origin.z);

  for (const angle of angles) {
    const dir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    wallRaycaster.set(rayOrigin, dir);
    wallRaycaster.far = 1.4;

    const hits = wallRaycaster.intersectObjects(mapColliders, false);
    for (const hit of hits) {
      if (hit.face) {
        const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (Math.abs(worldNormal.y) < 0.5) {
          return true;
        }
      }
    }
  }
  return false;
}

// --- RF08 & RF09: FINAL DE PARTIDA (VICTORIA O GAME OVER) ---
function finishGame(win) {
  gameActive = false;
  try { controls.unlock(); } catch (err) {}
  if (win) {
    document.getElementById('win-screen')?.classList.remove('hidden');
  } else {
    document.getElementById('gameover-screen')?.classList.remove('hidden');
  }
}

// 7. Bucle principal
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (gameActive) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    direction.z = Number(moveState.forward) - Number(moveState.backward);
    direction.x = Number(moveState.right) - Number(moveState.left);
    direction.normalize();

    const speed = 55.0;
    if (moveState.forward || moveState.backward) velocity.z -= direction.z * speed * delta;
    if (moveState.left || moveState.right) velocity.x -= direction.x * speed * delta;

    const playerPos = controls.getObject().position;
    const prevPos = playerPos.clone();

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);

    const stepVector = new THREE.Vector3().subVectors(playerPos, prevPos);
    if (stepVector.lengthSq() > 0.00001 && checkWallCollision(prevPos, stepVector)) {
      playerPos.copy(prevPos);
    }

    playerPos.y = mapGroundY + 1.8;
    coordsLabel.textContent = `Posición X: ${playerPos.x.toFixed(1)} | Z: ${playerPos.z.toFixed(1)}`;

    // Comportamiento de los zombis (RF05 & RF09)
    for (const zombie of zombies) {
      if (!zombie.userData.alive) continue;

      const distToPlayer = new THREE.Vector2(zombie.position.x, zombie.position.z)
        .distanceTo(new THREE.Vector2(playerPos.x, playerPos.z));

      if (distToPlayer <= zombie.userData.detectionRange) {
        zombie.lookAt(playerPos.x, zombie.position.y, playerPos.z);
        const moveDir = new THREE.Vector3()
          .subVectors(playerPos, zombie.position)
          .setY(0)
          .normalize();

        if (!checkWallCollision(zombie.position, moveDir)) {
          zombie.position.addScaledVector(moveDir, zombie.userData.speed * delta);
        } else {
          // Deslizamiento lateral si encuentra una pared
          const sideDir = new THREE.Vector3(-moveDir.z, 0, moveDir.x);
          if (!checkWallCollision(zombie.position, sideDir)) {
            zombie.position.addScaledVector(sideDir, zombie.userData.speed * delta * 0.7);
          }
        }
      }

      if (distToPlayer < 1.5) {
        finishGame(false);
        return;
      }
    }

    // Recolección de cajas de munición (RF02 & RF10)
    for (const box of ammoBoxes) {
      if (box.userData.collected) continue;
      box.rotation.y += delta * 1.5;

      const distToBox = new THREE.Vector2(box.position.x, box.position.z)
        .distanceTo(new THREE.Vector2(playerPos.x, playerPos.z));

      if (distToBox < 2.0) {
        box.userData.collected = true;
        box.visible = false;
        weapons[currentWeapon].ammo = Math.min(
          weapons[currentWeapon].maxAmmo,
          weapons[currentWeapon].ammo + box.userData.amount
        );
        updateWeaponHUD();
      }
    }

    // Verificación de llegada a la zona verde de extracción (RF08)
    const distToExit = new THREE.Vector2(extractionZone.position.x, extractionZone.position.z)
      .distanceTo(new THREE.Vector2(playerPos.x, playerPos.z));

    if (distToExit < 3.2) {
      finishGame(true);
      return;
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
