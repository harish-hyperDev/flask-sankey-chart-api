import pandas as pd
import csv, json
from flask import Flask, render_template, jsonify

app = Flask(__name__)


# Home for multi timelines
@app.route('/', methods=['GET', 'POST'])
def home():
    return render_template('index.html')


# For sending data to Sankey in JSON format
@app.route('/get_data', methods=['GET'])
def send_data():
    
    csv_file_path = 'static/leadconvert.csv'
    data = []
    
    with open(csv_file_path, 'r') as csv_file:
        csv_reader = csv.DictReader(csv_file)
        for row in csv_reader:
            data.append(row)

    return jsonify(data)


if __name__ == "__main__":
    app.run()