import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import getStars from './satellite-tracker/getStars.js';
import { getLatLngObj} from "tle.js";

import {posToAngle, getPosByAngle } from './satellite-tracker/earthUtils.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 20); // x, y, z

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

const textureLoader = new THREE.TextureLoader();

const centerLight = new THREE.PointLight(0xFFDEA2, 6000);
centerLight.position.set(16, 30, 18);

const blueLight1 = new THREE.PointLight(0x0082FF, 6000);
blueLight1.position.set(16, 30, 20);

const backlight = new THREE.PointLight(0x744F2A, 1300);
backlight.position.set(-16, -26, -10);

const ambientLight = new THREE.AmbientLight(0x404040, 2);

scene.add(centerLight);
scene.add(blueLight1);
scene.add(backlight);
scene.add(ambientLight);

const stars = getStars({ numStars: 400 });
scene.add(stars);

const objects = new Map(); //{str objName: CelObject}
const objectstoName = new Map(); //{CelObj.mesh: strObjName}

class CelObject {
  constructor(longitude, latitude, height, radius, segments = 30, material, name) {
    this.segments = segments;
    this.radius = radius;
    this.material = material;
    this.name = name;

    this.longitude = longitude;
    this.latitude = latitude;


    this.createObject();
    this.placeObject(longitude, latitude, height + this.radius);
  }
  getSelfLocation() {
    return [this.longitude, this.latitude];
  }

  createObject() {
    const objectMaterial = new THREE.MeshStandardMaterial(this.material);
    const objectGeometry = new THREE.SphereGeometry(this.radius, this.segments, this.segments);
    this.mesh = new THREE.Mesh(objectGeometry, objectMaterial);
    objects.set(this.name, this);
    objectstoName.set(this.mesh, this.name);
    // Add the object to the scene
    scene.add(this.mesh);
    // Add the object to the objects array
  }


  placeObject(longitude, latitude, height) {
    const { x, y, z } = this.getPosByAngle(longitude, latitude, height);
    this.mesh.position.set(x, y, z);
  }

  getEarthRadian(longitude, latitude) {
    const targetLongitude = -(longitude-90) * (Math.PI / 180);
    const targetLatitude = latitude * (Math.PI / 180);
    return [targetLongitude, targetLatitude];
  }

  getPosByAngle(longitude, latitude, radius) {
    const [lonRadian, latRadian] = this.getEarthRadian(longitude, latitude);
    const x = (radius ) * Math.cos(latRadian) * Math.cos(lonRadian);
    const y = (radius ) * Math.sin(latRadian);
    const z = (radius ) * Math.cos(latRadian) * Math.sin(lonRadian);// Use Math.cos(phi) instead of Math.cos(theta)
    return { x, y, z };
  }
}

class Satellite extends CelObject {
  constructor(longitude, latitude, name) {
    super(longitude, latitude, 6, 0.1, 32, { color: 0xFFFFFF }, name);
  }
}

const earthTexture = textureLoader.load('./img/uvearth.jpeg');
const earthMaterial = new THREE.MeshStandardMaterial({ map: earthTexture });
const earth = new CelObject(0, 0, -5, 5, 50, earthMaterial, "Earth");
earth.mesh.rotation.y = -Math.PI / 2;  //change to 90 degrees 

let ActiveSatIds = new Set(['28654', '47966', '42828']);
const SatTLES = new Map(); // name, longitude, latitude, id of active satellites
const satellites = {}; // Object to store active Satellite object instances
async function getSatelliteData(satelliteId) {
  const apiUrl = 'https://tle.ivanstanojevic.me/api/tle';

  try {
    const response = await fetch(`${apiUrl}/${satelliteId}`);
    if (!response.ok) {
      throw new Error(`Error fetching TLE data for satellite ID ${satelliteId}: ${response.statusText}`);
    }
    const data = await response.json();
    console.log(data)
    const tleLine1 = data.line1;
    const tleLine2 = data.line2;
    const tle2line = `${tleLine1}\n${tleLine2}`;
    console.log(`Retrieved data for satellite ID ${satelliteId}:`, data.name);
    const latlong = getLatLngObj(tle2line);
    SatTLES.set(satelliteId,{ longitude: latlong.lng, latitude: latlong.lat, id: satelliteId, name: data.name });
    return data;
  } catch (error) {
    console.error(`Error fetching TLE data for satellite ID ${satelliteId}:`, error);
    throw error;
  }
}
async function addSatellite(satelliteId) {
  const satIdString = satelliteId.toString();
  if (!SatTLES.has(satIdString)) {
    try {
      const data = await getSatelliteData(satIdString);
      if (data) {
        console.log("Data received for satellite ID", satelliteId);
        
        const satVals = SatTLES.get(satIdString);
        satellites[satelliteId] = new Satellite(satVals.longitude, satVals.latitude, satVals.name);
        scene.add(satellites[satelliteId].mesh);
      }
    } catch (error) {
      console.error(`Error adding satellite ID ${satelliteId}:`, error);
      // Optionally, you can choose to handle the error without removing the satellite
      // For example, you can log the error and display a message to the user
    }
  }
}

function removeSatellite(satelliteId, listItem) {

  if (SatTLES.has(satelliteId)) {
    SatTLES.delete(satelliteId)
    if (satellites[satelliteId]) {
      scene.remove(satellites[satelliteId].mesh);
      delete satellites[satelliteId];
    }
  }
  ActiveSatIds.delete(satelliteId);
  listItem.remove();
  updateActiveSatellites(ActiveSatIds);
}


const activeSatHtmlList = document.getElementById("active-satellites");
let displayActiveSats = ""; // HTML text

window.updateActiveSatellites = async function(newSatelliteIds) {
  
  const existingSatelliteIds = new Set(SatTLES.keys());
  const satellitesToRemove = new Set([...existingSatelliteIds].filter(id => !newSatelliteIds.has(id)));
  for (const satelliteId of satellitesToRemove) {
    await removeSatellite(satelliteId);
  }
  
  const satellitesToAdd = new Set([...newSatelliteIds].filter(id => !existingSatelliteIds.has(id)));

  for (const satelliteId of satellitesToAdd) {
    await addSatellite(satelliteId);
    if (SatTLES.has(satelliteId)) {
      const listItem = document.createElement('li');
      listItem.classList.add('satelliteLine');

      const satelliteName = document.createElement('a');
      satelliteName.textContent = `${satelliteId} (${SatTLES.get(satelliteId).name})`;
      listItem.appendChild(satelliteName);

      const closeButton = document.createElement('a');
      closeButton.textContent = 'x';
      closeButton.addEventListener('click', function() {
        removeSatellite(satelliteId, listItem);
      });
      listItem.appendChild(closeButton);

      activeSatHtmlList.appendChild(listItem);
    }
  }
};


updateActiveSatellites(ActiveSatIds); // Initial setup


const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
searchButton.addEventListener('click', function () {
  const searchValue = searchInput.value.trim(); // Trim any leading or trailing whitespace
  if (searchValue !== '' && !ActiveSatIds.has(searchValue)) {
    ActiveSatIds.add(searchValue);
    updateActiveSatellites(ActiveSatIds);
  }
});





















function onDocumentMouseMove(event) {
  event.preventDefault(); // Prevent default mousemove action, e.g., highlighting text, side scrolling
  const mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;   //[top, bottom] --> [0, 1] --> [0,-1] [0,-2] [1, -1]

  // Raycasting to check if the mouse is over the globe
  const raycaster = new THREE.Raycaster(); //cast rays into your 3D scene and perform intersection tests with objects.
  raycaster.setFromCamera(mouse, camera); //raycaster originate from the camera, directed towards the mouse position

  const objectMeshes = [];
  objects.forEach((object) => {
    objectMeshes.push(object.mesh);
  });

  const intersects = raycaster.intersectObjects(objectMeshes);
  if (intersects.length > 0) {
    const intersectedObject = intersects[0].object;
    const intersectingName = objectstoName.get(intersectedObject)
    document.getElementById("Hover-detail").innerText = intersectingName;

    if (intersectedObject === earth.mesh) {
      const pointd = intersects[0].point;
      const radius = earth.radius;
      const longitude = (Math.atan2(pointd.x, pointd.z) / Math.PI) * 180;
      const latitude = Math.asin(pointd.y / radius) * (180 / Math.PI);
    
      let DisplayLong = `<div>Longitude: ${Math.abs(longitude).toFixed(3)} ${longitude < 0 ? "West" : "East"}</div>`;
      let DisplayLat = `<div>Latitude: ${Math.abs(latitude).toFixed(3)} ${latitude < 0 ? "South" : "North"}</div>`;
      
      document.getElementById("coordinates").innerHTML = "<br>" + DisplayLong + DisplayLat;
    }
    else {
      const [longitude, latitude] = objects.get(intersectingName).getSelfLocation()
      let DisplayLong = `<div>Longitude: ${Math.abs(longitude).toFixed(3)} ${longitude < 0 ? "West" : "East"}</div>`;
      let DisplayLat = `<div>Latitude: ${Math.abs(latitude).toFixed(3)} ${latitude < 0 ? "South" : "North"}</div>`;
      document.getElementById("coordinates").innerHTML = "<br>" + DisplayLong + DisplayLat;
    }
  }
}
document.addEventListener('mousemove', onDocumentMouseMove);


document.getElementById("zoom-in").addEventListener("click", () => {
  const [longitude, latitude, radius] = posToAngle(camera.position.x, camera.position.y, camera.position.z);
  const [x, y, z] = getPosByAngle(longitude, latitude, radius - 2);
  camera.position.x = x;
  camera.position.y = y;
  camera.position.z = z;
  camera.lookAt(earth.mesh.position);

});


document.getElementById("zoom-out").addEventListener("click", () => {
  const [longitude, latitude, radius] = posToAngle(camera.position.x, camera.position.y, camera.position.z);
  const [x, y, z] = getPosByAngle(longitude, latitude, radius + 2);
  camera.position.x = x;
  camera.position.y = y;
  camera.position.z = z;
  camera.lookAt(earth.mesh.position);
});


const toggle = document.getElementById('toggle');
const switchText = document.getElementById('switch-text');

let cameraRotating = true;

toggle.addEventListener('change', function() {
  cameraRotating = !cameraRotating;
  if (this.checked) {
    switchText.textContent = 'stop rotating';
  } else {
    switchText.textContent = 'rotate';
  }
});


function animate() {
  requestAnimationFrame(animate);

  if(cameraRotating){
    const [longitude, latitude, radius] = posToAngle(camera.position.x, camera.position.y, camera.position.z);
    if(longitude >=180){
      longitude = -(longitude)
    }
  
    const [x, y, z] = getPosByAngle((longitude+0.05), (latitude), radius);
    camera.position.x = x;
    camera.position.y = y;
    camera.position.z = z;
    camera.lookAt(earth.mesh.position);
  }
 
  // Update controls
  controls.target.set(earth.mesh.position.x, earth.mesh.position.y, earth.mesh.position.z);
  // Render the scene with updated camera position
  renderer.render(scene, camera);
}

animate();