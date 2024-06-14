from flask import Flask, request, jsonify
import reverse_geocode
import numpy as np
from scipy.spatial import KDTree
import pandas as pd
import math
import os
from transformers import GPT2TokenizerFast
# from langchain.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import CohereEmbeddings
from langchain.vectorstores import FAISS
# from langchain.chains.question_answering import load_qa_chain
from langchain.llms import Cohere
# from langchain.chains import ConversationalRetrievalChain
from flask_cors import CORS
import slate3k as slate
from transformers import AutoTokenizer, BartForConditionalGeneration, pipeline
import cohere

model = BartForConditionalGeneration.from_pretrained("facebook/bart-large-cnn")
tokenizer = AutoTokenizer.from_pretrained("facebook/bart-large-cnn")

summarizer = pipeline(
    "summarization", model="philschmid/bart-large-cnn-samsum")

os.environ["COHERE_API_KEY"] = "COHERE KEY"
co = cohere.Client('COHERE KEY')

economic_path = os.path.join(os.path.dirname(__file__), "economicdata.csv")
economic = pd.read_csv(economic_path)
all_path = os.path.join(os.path.dirname(__file__), "all.csv")
tectonic_plates = pd.read_csv(all_path)
updated_path = os.path.join(os.path.dirname(__file__), "updated_info.csv")
data = pd.read_csv(updated_path)
data = data.drop([9258, 9479, 18023])
socioeconomic_path = os.path.join(
    os.path.dirname(__file__), "socioeconomic.csv")
demographics = pd.read_csv(socioeconomic_path, encoding="ISO-8859-1")

app = Flask(__name__)
CORS(app, origins='http://localhost:3000')

with open('ts500.txt', 'r') as f:
    text = f.read()

tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")


def count_tokens(text: str) -> int:
    return len(tokenizer.encode(text))


text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500, chunk_overlap=150, length_function=count_tokens)

chunks = text_splitter.create_documents([text])

embeddings = CohereEmbeddings()
db = FAISS.from_documents(chunks, embeddings)

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
    data["Distance_to_Input"] = data.apply(lambda row: haversine_distance(
        coord, (row["Latitude"], row["Longitude"])), axis=1)
    max_distance = data["Distance_to_Input"].max()
    max_composite_score = data["Composite Score"].max()

    data["Normalized_Distance"] = data["Distance_to_Input"] / max_distance
    data["Normalized_Composite_Score"] = data["Composite Score"] / \
        max_composite_score
    data["Weight"] = 0.7 * (1 - data["Normalized_Distance"]) + \
        0.3 * data["Normalized_Composite_Score"]
    data["Date"] = pd.to_datetime(data["Date"])
    data.sort_values(by="Date", ascending=False, inplace=True)

    most_recent_earthquakes = data.head(2)
    nearest_earthquakes = data.nsmallest(5, "Distance_to_Input")
    selected_earthquakes = pd.concat(
        [most_recent_earthquakes, nearest_earthquakes])
    current_time = pd.Timestamp.now()

    selected_earthquakes["Time_Since_Last_Earthquake"] = (
        current_time - selected_earthquakes["Date"]).dt.days / 365
    selected_earthquakes["Time_Decay_Factor"] = np.exp(
        -selected_earthquakes["Time_Since_Last_Earthquake"])
    selected_earthquakes["Weight"] = selected_earthquakes["Weight"] * \
        selected_earthquakes["Time_Decay_Factor"]
    selected_earthquakes["Weighted_Danger_Level"] = selected_earthquakes["Weight"] * \
        selected_earthquakes["Composite Score"]
    weighted_composite_score = (selected_earthquakes["Weighted_Danger_Level"].sum(
    ) / selected_earthquakes["Weight"].sum()) * 0.7

    print(selected_earthquakes[["Latitude", "Longitude",
          "Distance_to_Input", "Composite Score", "Weighted_Danger_Level"]])

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


def find_closest_faults_quakes(lat, lon, plates, num_closest_lines):
    given_coordinate = (lat, lon)
    closest_fault_lines = []
    closest_earthquakes = []

    for plate in plates:
        plate_vals = tectonic_plates[tectonic_plates["plate"] == plate]
        distance_to_plate = haversine_distance(
            given_coordinate, (plate_vals['lat'].iloc[0], plate_vals['lon'].iloc[0]))
        closest_fault_lines.append((plate, distance_to_plate))

    closest_fault_lines.sort(key=lambda x: x[1])
    closest_fault_lines = closest_fault_lines[:num_closest_lines]

    for index, row in data.iterrows():
        distance = haversine_distance(
            given_coordinate, (row['Latitude'], row['Longitude']))
        closest_earthquakes.append(
            (row['Latitude'], row['Longitude'], distance))

    closest_earthquakes.sort(key=lambda x: x[2])
    closest_earthquakes = closest_earthquakes[:num_closest_lines]

    return closest_fault_lines, closest_earthquakes

def structure(lat_in, lon_in):
    plates = list(tectonic_plates["plate"].unique())

    closest_fault_lines = []
    closest_earthquakes = []
    distance_to_fault_lines = float('inf')
    num_closest_lines = 4

    for plate in plates:
        plate_vals = tectonic_plates[tectonic_plates["plate"] == plate]
        lats = plate_vals["lat"].values
        lons = plate_vals["lon"].values
        points = list(zip(lats, lons))
        indexes = [None] + [i + 1 for i, x in enumerate(points) if i < len(
            points) - 1 and abs(x[1] - points[i + 1][1]) > 300] + [None]

        for i in range(len(indexes) - 1):
            for quake_lat, quake_lon in points[indexes[i]:indexes[i+1]]:
                distance = haversine_distance(
                    (lat_in, lon_in), (quake_lat, quake_lon))
                if distance < distance_to_fault_lines:
                    distance_to_fault_lines = distance
                    closest_earthquakes = [(quake_lat, quake_lon, distance)]
                elif distance == distance_to_fault_lines:
                    closest_earthquakes.append(
                        (quake_lat, quake_lon, distance))

            distance_to_plate = haversine_distance(
                (lat_in, lon_in), (plate_vals['lat'].iloc[0], plate_vals['lon'].iloc[0]))
            closest_fault_lines.append((plate, distance_to_plate))

    closest_fault_lines.sort(key=lambda x: x[1])
    closest_fault_lines = closest_fault_lines[:num_closest_lines]
    closest_earthquakes.sort(key=lambda x: x[2])
    closest_earthquakes = closest_earthquakes[:num_closest_lines]

    closest_fault_lines_list = []
    closest_earthquakes_list = []

    for index, row in data.head(20).iterrows():
        closest_fault_lines, closest_earthquakes = find_closest_faults_quakes(
            row['Latitude'], row['Longitude'], plates, num_closest_lines)
        closest_fault_lines_list.append(closest_fault_lines)
        closest_earthquakes_list.append(closest_earthquakes)

    results_df = pd.DataFrame({
        'Latitude': data.head(20)['Latitude'],
        'Longitude': data.head(20)['Longitude'],
        'Closest_Fault_Lines': closest_fault_lines_list,
        'Closest_Earthquakes': closest_earthquakes_list
    })

    return results_df[0:20]

def code_sim(query):
    docs = db.similarity_search(query)
    return (docs)

@app.route('/api/python')
def main():
    return 'Hello'

@app.route('/api/structure', methods=['POST', 'GET'])
def struct():
    if request.method == "POST":
        try:
            lat = float(request.form['lat'])
            lon = float(request.form['lon'])

            df = structure(lat, lon)

            return df.to_json(orient='records')
        except Exception as e:
            return jsonify({'error': str(e)}), 400
    else:
        return jsonify({'message': 'Use POST request to calculate structure data'})


@app.route('/api/risk', methods=["POST", "GET"])
def risk():
    if request.method == "POST":
        try:
            lat = float(request.form['lat'])
            lon = float(request.form['lon'])

            risk_score, economic_score, regulatory_score, country_identified, gdppc_value = runModel(
                lat, lon)

            response = {
                'riskScore': risk_score,
                'economicScore': economic_score,
                'regulatoryScore': regulatory_score,
                'gdppc': round(np.log(gdppc_value), 3),
                'country': country_identified
            }

            return jsonify(response)
        except Exception as e:
            # Return an error response with status code 400
            return jsonify({'error': str(e)}), 400
    else:
        return jsonify({'message': 'Use POST request to calculate risk'})


@app.route('/api/codes', methods=["POST", "GET"])
def codes():
    if request.method == "POST":
        try:
            query = request.form['query']
            results = code_sim(query)
            page_contents = [result.page_content for result in results]
            ARTICLE = ' '.join(page_contents)
            # inputs = tokenizer([ARTICLE], max_length=1024, return_tensors="pt", truncation=True)

            # summary_ids = model.generate(inputs["input_ids"], num_beams=4, min_length=50, max_length=150, no_repeat_ngram_size=2)
            # x1 = tokenizer.batch_decode(summary_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]

            # Generate summary using the summarizer pipeline
            x2 = summarizer(ARTICLE, min_length=100, max_length=300, num_beams=1, truncation=True)[0]['summary_text']

            # response = co.summarize( 
            #    text=ARTICLE,
            #    length='short',
            #    format='paragraph',
            #    model='summarize-xlarge',
            #    additional_command='',
            #    temperature=0.6,
            #)
            #  
            return jsonify({'result': x2 })
        except Exception as e:
            return jsonify({'error': str(e)}), 400
    else:
        return jsonify({'message': 'Use POST request to send query'})

if __name__ == '__main__':
    app.run(debug=True, port=2000)