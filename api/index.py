from flask import Flask, request, json
import reverse_geocode
import numpy as np
from scipy.spatial import KDTree
import pandas as pd
import math
import os

economic_path = os.path.join(os.path.dirname(__file__), "../datasets/economicdata.csv")
economic = pd.read_csv(economic_path)
all_path = os.path.join(os.path.dirname(__file__), "../datasets/all.csv")
tectonic_plates = pd.read_csv(all_path)
updated_path = os.path.join(os.path.dirname(__file__), "../datasets/updated_info.csv")
data = pd.read_csv(updated_path)
data = data.drop([9258, 9479, 18023])
socioeconomic_path = os.path.join(os.path.dirname(__file__), "../datasets/socioeconomic.csv")
demographics = pd.read_csv(socioeconomic_path, encoding="ISO-8859-1")

app = Flask(__name__)


def haversine_distance(coord1, coord2):
    lat1, lon1 = coord1
    lat2, lon2 = coord2
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * \
        math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    earth_radius_km = 6371
    distance = earth_radius_km * c
    return distance


tree = KDTree(data[["Latitude", "Longitude"]])

fault_line_tree = KDTree(tectonic_plates[["lat", "lon"]])


def find_nearest_fault_line(coord):
    distance_to_nearest_fault, index_of_nearest_fault = fault_line_tree.query(
        coord)
    nearest_fault_line = tectonic_plates.iloc[index_of_nearest_fault]
    return nearest_fault_line


def calculate_distance_to_fault(row):
    earthquake_coordinate = (row["Latitude"], row["Longitude"])
    nearest_fault_line = find_nearest_fault_line(earthquake_coordinate)
    distance_to_fault = haversine_distance(
        earthquake_coordinate, (nearest_fault_line["lat"], nearest_fault_line["lon"]))
    return distance_to_fault

def locate_nearest_earthquakes(coord):
    data["Distance_to_Fault"] = data.apply(calculate_distance_to_fault, axis=1)
    data["Distance_to_Input"] = data.apply(lambda row: haversine_distance(coord, (row["Latitude"], row["Longitude"])), axis=1)
    max_distance = data["Distance_to_Input"].max()
    max_composite_score = data["Composite Score"].max()

    data["Normalized_Distance"] = data["Distance_to_Input"] / max_distance
    data["Normalized_Composite_Score"] = data["Composite Score"] / max_composite_score
    data["Weight"] = 0.7 * (1 - data["Normalized_Distance"]) + 0.3 * data["Normalized_Composite_Score"]
    data["Date"] = pd.to_datetime(data["Date"]) 
    data.sort_values(by="Date", ascending=False, inplace=True)

    most_recent_earthquakes = data.head(2)
    nearest_earthquakes = data.nsmallest(5, "Distance_to_Input")
    selected_earthquakes = pd.concat([most_recent_earthquakes, nearest_earthquakes])
    current_time = pd.Timestamp.now()
    
    selected_earthquakes["Time_Since_Last_Earthquake"] = (current_time - selected_earthquakes["Date"]).dt.days / 365
    selected_earthquakes["Time_Decay_Factor"] = np.exp(-selected_earthquakes["Time_Since_Last_Earthquake"])
    selected_earthquakes["Weight"] = selected_earthquakes["Weight"] * selected_earthquakes["Time_Decay_Factor"]
    selected_earthquakes["Weighted_Danger_Level"] = selected_earthquakes["Weight"] * selected_earthquakes["Composite Score"]
    weighted_composite_score = (selected_earthquakes["Weighted_Danger_Level"].sum() / selected_earthquakes["Weight"].sum()) * 0.7

    print(selected_earthquakes[["Latitude", "Longitude", "Distance_to_Input", "Composite Score", "Weighted_Danger_Level"]])

    return weighted_composite_score

def runModel(latitude_input, longitude_input):
    input_coordinate = (latitude_input, longitude_input)

    weighted_composite_score = locate_nearest_earthquakes(input_coordinate)

    location = reverse_geocode.search([(latitude_input, longitude_input)])
    country_identified = location[0]["country"]

    demographics_country_2010 = demographics[(
        demographics["country"] == country_identified) & (demographics["year"] == 2010)]

    identified_extended = economic[economic["Countries"] == country_identified]

    country_regulation = float(identified_extended["Regulation"].iloc[0])
    country_regulatory_burden = float(
        identified_extended["Regulatory Burden"].iloc[0])
    country_labor_market_regulations = float(
        identified_extended["Labor market regulations"].iloc[0])
    country_licensing_restrictions = float(
        identified_extended["Licensing restrictions"].iloc[0])
    country_business_regulations = float(
        identified_extended["Business regulations"].iloc[0])
    country_administrative_requirements = float(
        identified_extended["Administrative requirements"].iloc[0])

    if not demographics_country_2010.empty:
        ses_value = demographics_country_2010["SES"].iloc[0]
        gdppc_value = demographics_country_2010["gdppc"].iloc[0]
        print(f"Country is {country_identified}")
    else:
        print(f"Data not available for {country_identified} in the year 2010.")

    sum = country_regulation + country_regulatory_burden + country_labor_market_regulations + \
        country_licensing_restrictions + country_business_regulations + \
        country_administrative_requirements
    regulatory_score = round(sum/6, 3)
    print(f"Regulatory Score: {regulatory_score}")
    economic_score = round(ses_value/10, 3)
    print(f"Economic Score: {economic_score}")
    risk_score = round(weighted_composite_score, 3)
    print(f"Risk Score: {risk_score}")

    return risk_score, economic_score, regulatory_score, country_identified, gdppc_value


@app.route('/api/python')
def main():
    return 'Hello'


@app.route('/')
def main():
    return 'Hi'

@app.route('/api/risk', methods=["POST", "GET"])
def risk():
    lat = int(request.form['lat'])
    lon = int(request.form['lon'])
    risk_score, economic_score, regulatory_score, country_identified, gdppc_value = runModel(lat, lon)
    return json.dumps({'Risk Score': risk_score, 'Economic Score': economic_score, 'Regulatory Score': regulatory_score, 'GDPPC': round(np.log(gdppc_value), 3), 'Country': country_identified })


if __name__ == '__main__':
    app.run(debug=True, port=2000)