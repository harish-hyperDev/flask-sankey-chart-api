import pandas as pd
import csv, json
from flask import Flask, render_template, jsonify

app = Flask(__name__)


# Home for multi timelines
@app.route('/', methods=['GET', 'POST'])
def home():
    return render_template('index.html')


if __name__ == "__main__":
    app.run()