import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import mapboxgl from "mapbox-gl";
import {
  Button,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Text,
} from "@chakra-ui/react";
import { Layer, Map, MapRef, ViewState } from "react-map-gl";
import Image from "next/image";

export default function MapVis() {
  const [currentMag, setCurrentMag] = useState(null);
  const [currentPlace, setCurrentPlace] = useState(null);
  const [currentTime, setCurrentTime] = useState(null);
  const [currentLat, setCurrentLat] = useState(null);
  const [currentLng, setCurrentLng] = useState(null);
  const [click, setClick] = useState(null);
  const [hvsrValues, setHvsrValues] = useState(null);
  const [ranges, setRanges] = useState(null);
  let closest = [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnalysisStarted, setIsAnalysisStarted] = useState(false);
  const [isAnalysisComplete, setIsAnalysisComplete] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [dataList, setDataList] = useState([]);

  const [faultFeatures, setFaultFeatures] = useState(null);

  const [x, setX] = useState(Math.random() * 70);
  const [y, setY] = useState(Math.random() * 50);
  const [z, setZ] = useState(Math.random() * 25);

  const { reverse } = require("reverse-geocode");

  const [] = useState();

  function handleOpenModal() {
    setIsOpen(true);
  }

  function handleCloseModal() {
    setIsOpen(false);
  }

  function handleReverseGeocode(lon, lat, loc) {
    console.log("here!");
  }

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: "map-container",
      style: "mapbox://styles/mapbox/dark-v11",
      center: [144, 9],
      zoom: 3,
    });

    const feed = "updated.geojson";
    const recent_feed =
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson";

    map.on("load", function () {
      map.addSource("earthquakes", {
        type: "geojson",
        data: feed,
      });

      map.addSource("recent_earthquakes", {
        type: "geojson",
        data: recent_feed,
      });

      const secondsPerRevolution = 80;
      const maxSpinZoom = 5;
      const slowSpinZoom = 3;

      let userInteracting = false;
      let spinEnabled = true;

      function spinGlobe() {
        const zoom = map.getZoom();
        if (spinEnabled && !userInteracting && zoom < maxSpinZoom) {
          let distancePerSecond = 360 / secondsPerRevolution;
          if (zoom > slowSpinZoom) {
            const zoomDif = (maxSpinZoom - zoom) / (maxSpinZoom - slowSpinZoom);
            distancePerSecond *= zoomDif;
          }
          const center = map.getCenter();
          center.lng -= distancePerSecond;
          map.easeTo({ center, duration: 1000, easing: (n) => n });
        }
      }

      // Pause spinning on interaction
      map.on("mousedown", () => {
        userInteracting = true;
      });

      map.on("mouseup", () => {
        userInteracting = false;
        spinGlobe();
      });

      map.on("dragend", () => {
        userInteracting = false;
        spinGlobe();
      });
      map.on("pitchend", () => {
        userInteracting = false;
        spinGlobe();
      });
      map.on("rotateend", () => {
        userInteracting = false;
        spinGlobe();
      });

      map.on("moveend", () => {
        spinGlobe();
      });

      spinGlobe();

      map.addLayer({
        id: "earthquake-layer",
        type: "circle",
        source: "earthquakes",
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "Magnitude"],
            0,
            "#687073",
            4,
            "#66A0D3",
            6,
            "#479ce7",
            8,
            "#0072B5",
          ],
          "circle-radius": {
            property: "Magnitude",
            base: 5.0,
            stops: [
              [{ zoom: 0, value: 0 }, 1],
              [{ zoom: 0, value: 5 }, 2],
              [{ zoom: 0, value: 7 }, 8],
              [{ zoom: 11, value: 0 }, 2],
              [{ zoom: 11, value: 5 }, 4],
              [{ zoom: 11, value: 7 }, 16],
              [{ zoom: 20, value: 0 }, 4],
              [{ zoom: 20, value: 5 }, 6],
              [{ zoom: 20, value: 7 }, 20],
            ],
          },
          "circle-opacity": 0.7,
          "circle-stroke-color": "rgba(0, 0, 0, 0)",
          "circle-stroke-width": 2,
        },
      });

      map.addLayer({
        id: "earthquake-layers",
        type: "circle",
        source: "recent_earthquakes",
        paint: {
          "circle-color": "#5481da",
          "circle-radius": {
            property: "mag",
            base: 5.0,
            stops: [
              [{ zoom: 0, value: 4 }, 1],
              [{ zoom: 0, value: 6 }, 10],
              [{ zoom: 11, value: 4 }, 5],
              [{ zoom: 11, value: 6 }, 20],
              [{ zoom: 20, value: 4 }, 10],
              [{ zoom: 20, value: 6 }, 30],
            ],
          },
          "circle-opacity": 0.7,
          "circle-stroke-color": "rgba(0, 0, 0, 0)",
          "circle-stroke-width": 2,
        },
      });

      map.on("click", function (e) {
        const clickedLngLat = e.lngLat;
        setClick(e.lngLat);
        const earthquakes = map.querySourceFeatures("earthquakes");
        earthquakes.forEach((quake) => {
          const [lng, lat] = quake.geometry.coordinates;
          const distance = haversineDistance(
            clickedLngLat.lng,
            clickedLngLat.lat,
            lng,
            lat
          );
          quake.properties.distance = distance;
        });
        earthquakes.sort(
          (a, b) => a.properties.distance - b.properties.distance
        );
        const closestQuakes = earthquakes.slice(0, 30);
        setDataList([...new Set(earthquakes.slice(0, 15))]);
        closest.length = 0; // reset the array
        closestQuakes.forEach((quake) => {
          map.setPaintProperty("earthquake-layer", "circle-color", [
            "case",
            ["==", ["get", "place"], quake.properties.place],
            "#ff0000",
            "#00e5ff",
          ]);
          const rate = 500 * Math.log(quake.properties.mag); // sample rate in Hz
          const distanceKM = quake.properties.distance / 1000; // distance in kilometers
          const magnitude = quake.properties.mag;
          const HVSR =
            1000 *
            (1000 * rate) ** (Math.log(magnitude) - 1) *
            Math.exp(1 - 0.039 * distanceKM);
          if (HVSR && HVSR > 1 && HVSR < 500) {
            closest.push(HVSR); // append the HVSR value to the array
          }
        });
        closest.sort();
        let rangeVals = [...new Set(closest)];
        console.log(rangeVals);

        const medianIndex = Math.floor(rangeVals.length / 2);
        if (rangeVals.length > 5) {
          setRanges(
            `${
              Math.round(
                ((rangeVals[medianIndex - 2] + rangeVals[medianIndex - 1]) /
                  2) *
                  100
              ) / 100
            } HVSR to ${
              ((Math.round(
                rangeVals[medianIndex + 2] + rangeVals[medianIndex + 1]
              ) /
                2) *
                100) /
              100
            } HVSR`
          );
        } else if (rangeVals.length > 2) {
          setRanges(
            `${Math.round(rangeVals[0] * 100) / 100} to ${
              Math.round(100 * rangeVals[rangeVals.length - 1]) / 100
            } HVSR`
          );
        } else if (rangeVals.length > 0) {
          setRanges(`${Math.round(100 * rangeVals[0]) / 100} HVSR`);
        } else {
          setRanges("No Testing Values Necessary");
        }
        console.log(
          `${
            Math.round(
              ((rangeVals[medianIndex - 2] + rangeVals[medianIndex - 1]) / 2) *
                100
            ) / 100
          } to ${
            ((Math.round(
              rangeVals[medianIndex + 2] + rangeVals[medianIndex + 1]
            ) /
              2) *
              100) /
            100
          }`
        );
      });

      function haversineDistance(lon1, lat1, lon2, lat2) {
        const R = 6371e3; // metres
        const phi1 = (lat1 * Math.PI) / 180;
        const phi2 = (lat2 * Math.PI) / 180;
        const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
        const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

        const a =
          Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
          Math.cos(phi1) *
            Math.cos(phi2) *
            Math.sin(deltaLambda / 2) *
            Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const d = R * c;
        return d;
      }

      map.on("click", "earthquake-layer", function (e) {
        const quake = e.features[0];
        handleReverseGeocode(
          quake.geometry.coordinates[1],
          quake.geometry.coordinates[0],
          quake.properties["Location Source"]
        );
        setCurrentMag(quake.properties.Magnitude);
        setCurrentLat(quake.geometry.coordinates[0]);
        setCurrentLng(quake.geometry.coordinates[1]);
        setCurrentPlace(quake.properties.Country);
        setCurrentTime(quake.properties.Date_Time);
      });

      map.on("click", "earthquake-layers", function (e) {
        const quake = e.features[0];
        handleReverseGeocode(
          quake.geometry.coordinates[1],
          quake.geometry.coordinates[0],
          quake.properties["Location Source"]
        );
        setCurrentMag(quake.properties.Magnitude);
        setCurrentLat(quake.geometry.coordinates[0]);
        setCurrentLng(quake.geometry.coordinates[1]);
        setCurrentPlace(quake.properties.place);
        setCurrentTime(new Date(quake.properties.time).toLocaleString());
      });

      map.on("mouseenter", "earthquake-layer", function () {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "earthquake-layer", function () {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "earthquake-layers", function () {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "earthquake-layers", function () {
        map.getCanvas().style.cursor = "";
      });
    });
  }, []);

  useEffect(() => {
    console.log(currentPlace);
  }, [currentPlace]);

  useEffect(() => {
    console.log(hvsrValues, closest);
  }, [hvsrValues, closest, click]);

  return (
    <div style={{ position: "relative" }}>
      {currentLat && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            padding: 10,
            background: "rgba(255, 255, 255, 0.7)",
            boxShadow: "0px 1px 2px rgba(0,0,0,0.2)",
            borderRadius: 4,
            maxWidth: 500,
            zIndex: 100,
          }}
        >
          <h3>{currentPlace}</h3>
          <p>{currentTime}</p>
          <p>Magnitude: {currentMag}</p>
          <p>
            Coordinates: {currentLat}, {currentLng}
          </p>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          padding: 10,
          borderRadius: 4,
          maxWidth: 500,
          zIndex: 100,
        }}
      >
        <Text
          style={{
            color: "rgba(255,255,255, 1)",
            fontWeight: 400,
          }}
          fontSize={"2xl"}
        >
          Shapeshift
        </Text>
      </div>
      <div id="map-container" style={{ height: "100vh" }} />
    </div>
  );
}
