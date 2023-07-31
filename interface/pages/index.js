import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import mapboxgl from "mapbox-gl";
import {
  Button,
  ButtonGroup,
  Box,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Text,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Table,
  Thead,
  Tbody,
  Tfoot,
  Tr,
  Th,
  Td,
  TableCaption,
  TableContainer,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Heading,
  Lorem,
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
  const [] = useState();

  function handleOpenModal() {
    setIsOpen(true);
  }

  function handleCloseModal() {
    setIsOpen(false);
  }

  useEffect(() => {
    let timer;
    if (isAnalysisStarted && currentIndex < data.length - 1) {
      timer = setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
      }, 1500);
    }
    if (currentIndex === data.length - 1) {
      setIsAnalysisComplete(true);
      setIsOpen(true);
    }
    return () => clearTimeout(timer);
  }, [currentIndex, isAnalysisStarted]);


  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: "map-container",
      style: "mapbox://styles/mapbox/dark-v10",
      center: [-122.4324, 37.788],
      zoom: 3,
    });

    const feed =
      "http://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson";

    const fetchData = async () => {
      const response = await fetch("/data/tectonic_plates.csv");
      const csvData = await response.text();

      const parsedData = Papa.parse(csvData, { header: true });
      console.log(parsedData)
      const features = parsedData.data.map((item) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [parseFloat(item.lon), parseFloat(item.lat)],
        },
        properties: {
          plate: item.plate,
        },
      }));

      // Create a GeoJSON object
      const tectonicPlateGeoJSON = {
        type: "FeatureCollection",
        features: features,
      };

      setFaultFeatures(tectonicPlateGeoJSON);
    };
    
    map.on("load", function () {
      map.addSource("earthquakes", {
        type: "geojson",
        data: feed,
      });

      map.addSource("tectonic-plates", {
        type: "geojson",
        data: faultFeatures,
      });

      map.addLayer({
        id: "tectonic-plates-layer",
        type: "circle",
        source: "tectonic-plates",
        paint: {
          "circle-color": "#00e5ff",
          "circle-radius": {
            base: 5.0,
            stops: [
              [0, 1],
              [10, 40],
            ],
          },
          "circle-opacity": 0.7,
          "circle-stroke-color": "rgba(0, 0, 0, 0)",
          "circle-stroke-width": 2,
        },
      });

      map.addLayer({
        id: "earthquake-layer",
        type: "circle",
        source: "earthquakes",
        paint: {
          "circle-color": "#00e5ff",
          "circle-radius": {
            property: "mag",
            base: 5.0,
            stops: [
              [{ zoom: 0, value: 4 }, 1],
              [{ zoom: 0, value: 10 }, 40],
              [{ zoom: 11, value: 4 }, 10],
              [{ zoom: 11, value: 10 }, 1000],
              [{ zoom: 20, value: 4 }, 20],
              [{ zoom: 20, value: 10 }, 1000],
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
        setCurrentMag(quake.properties.mag);
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
    });
    fetchData();
  }, []);

  useEffect(() => {
    console.log(currentPlace);
  }, [currentPlace]);

  useEffect(() => {
    console.log(hvsrValues, closest);
  }, [hvsrValues, closest, click]);

  return (
    <div style={{ position: "relative" }}>
      {currentPlace && (
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
      {click && (
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            padding: 10,
            background: "rgba(255, 255, 255, 0.8)",
            boxShadow: "0px 1px 2px rgba(0,0,0,0.2)",
            borderRadius: 4,
            maxWidth: 500,
            zIndex: 100,
          }}
        >
          <p>
            Selected Coordinates: {Math.round(10000 * click.lat) / 10000},{" "}
            {Math.round(10000 * click.lng) / 10000}
          </p>
          <br />
          <p>Temperature</p>
          <Slider aria-label="slider-ex-1" defaultValue={30}>
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb />
          </Slider>
          <br />
          <p>Efficiency</p>
          <Slider aria-label="slider-ex-1" defaultValue={60}>
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb />
          </Slider>
          <br />
          <p>Policy Depth</p>
          <Slider aria-label="slider-ex-1" defaultValue={50}>
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb />
          </Slider>

          <Button
            colorScheme="teal"
            variant="solid"
            isLoading={isAnalysisStarted && !isAnalysisComplete}
            onClick={() => setIsAnalysisStarted(true)}
          >
            Analyze
          </Button>
          <br />
          <br />
          {isAnalysisStarted && (
            <div>
              <h2 style={{ fontWeight: 500 }}>Analysis In Progress...</h2>
              <div>
                {data.slice(0, currentIndex + 1).map((d, index) => (
                  <p key={index} className="log">
                    {d}
                  </p>
                ))}
              </div>
              <Button
                colorScheme="teal"
                variant="secondary"
                isLoading={isAnalysisStarted && !isAnalysisComplete}
                onClick={() => setIsOpen(true)}
              >
                Show Analysis
              </Button>
            </div>
          )}
        </div>
      )}
      {isAnalysisComplete ? <div></div> : null}
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
