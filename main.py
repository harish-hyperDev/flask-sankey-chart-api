import pandas as pd
import csv, json, datetime
from flask import Flask, render_template, jsonify

app = Flask(__name__)


# Home for multi timelines
@app.route('/', methods=['GET', 'POST'])
def home():
    
    # df = pd.read_csv('static/leadconvert.csv')
    # json_data = df.to_json(orient='records')
    
    # data_to_dict = json.loads(json_data)[0]
    
    dmy_date = "1/2/2023"
    ymd_date = datetime.datetime.strptime(dmy_date, "%d/%m/%Y").strftime("%Y/%m/%d")
    
    print(ymd_date + "\n")
    
    # return jsonify(data)
    return render_template('index.html')


# Needs to be implemented
@app.route('/<opp_id>/<type>', methods=['GET', 'POST'])
def api(opp_id, type):
    
    df = pd.read_csv('static/leadconvert.csv')
    data = df.to_json(orient='records')
    
    return render_template('index.html', 
                           id = opp_id, 
                        )


# For fetching data
@app.route('/get_data', methods=['GET'])
def send_data():
    
    csv_file_path = 'static/leadconvert.csv'
    data = []
    
    with open(csv_file_path, 'r') as csv_file:
        csv_reader = csv.DictReader(csv_file)
        for row in csv_reader:
            data.append(row)
    
    for date in data:
        
        lead_created_date = "" 
        opp_created_date = "" 
        opp_closed_date = ""
        
        if date['Created Date'] != "" and date['Converted Date'] != "":
            lead_created_date = datetime.datetime.strptime(date['Created Date'], "%d/%m/%Y").strftime("%Y/%m/%d")
            opp_created_date = datetime.datetime.strptime(date['Converted Date'], "%d/%m/%Y").strftime("%Y/%m/%d")
            
        if date['Oppt Close Date'] != "":
            opp_closed_date = datetime.datetime.strptime(date['Oppt Close Date'], "%d/%m/%Y").strftime("%Y/%m/%d")
        else:
            opp_closed_date = "Interested"
            
        date['Created Date'] = lead_created_date
        date['Converted Date'] = opp_created_date
        date['Oppt Close Date'] = opp_closed_date

    return jsonify(data)


if __name__ == "__main__":
    app.run()