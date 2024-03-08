let tempCharacteristic;
let tempChart;
let startTime;

let device;

let prevTemp = null;
const movingAverageWindowSize = 30; // Set the desired window size for the moving average filter

function calculateMovingAverage(data, windowSize) {
  const smoothedData = [];

  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;

    for (let j = Math.max(0, i - windowSize); j < Math.min(data.length, i + windowSize + 1); j++) {
      sum += data[j].y;
      count += 1;
    }

    const avg = sum / count;
    smoothedData.push({ x: data[i].x, y: avg });
  }

  return smoothedData;
}
function handleTemp(event, chart) {
  const { buffer } = event.target.value;
  const view = new DataView(buffer);
  const temp = view.getFloat64(0, true);
  const timestamp = new Date().getTime();

  const tempData = chart.data.datasets[0].data;
  tempData.push({ x: timestamp, y: temp });

  const smoothedTempData = calculateMovingAverage(tempData, movingAverageWindowSize);
  chart.data.datasets[0].data = smoothedTempData;

  if (prevTemp !== null) {
    const prevDataPoint = smoothedTempData[smoothedTempData.length - 2];
    const currDataPoint = smoothedTempData[smoothedTempData.length - 1];

    const timeDiff = currDataPoint.x - prevDataPoint.x;
    const tempDeriv = (currDataPoint.y - prevDataPoint.y) / (timeDiff / 1000); // Temperature derivative (°C/s)

    chart.data.datasets[1].data.push({ x: timestamp, y: tempDeriv });

    prevTemp = currDataPoint.y;
  } else {
    prevTemp = temp;
  }

  chart.update();

  const tempText = document.getElementById('currentTempText');
  if (tempText) {
    tempText.textContent = `Current Temperature: ${temp.toFixed(2)} °C`;
  } else {
    const tempDiv = document.createElement('div');
    tempDiv.id = 'currentTempText';
    tempDiv.style.fontSize = '50px';
    tempDiv.style.fontWeight = 'bold';
    tempDiv.style.marginBottom = '10px';
    tempDiv.textContent = `Current Temperature: ${temp.toFixed(2)} °C`;
    document.body.insertBefore(tempDiv, document.getElementById('tempChart'));
  }
}

function connectToESP32() {
  navigator.bluetooth.requestDevice({
    filters: [{ services: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b'] }],
  })
    .then((selectedDevice) => {
      device = selectedDevice;
      return device.gatt.connect();
    })
    .then((server) => server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b'))
    .then((service) => service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8'))
    .then((characteristic) => {
      tempCharacteristic = characteristic;
      return tempCharacteristic.startNotifications();
    })
    .then(() => {
      console.log('Notifications started');
      startTime = new Date(); // save the time when we hit start
      // Initialize the chart here

      tempChart = new Chart(document.getElementById('tempChart'), {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Temperature',
            data: [],
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
          },
          {
            label: 'Temperature Derivative',
            data: [],
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            yAxisID: 'derivative-axis', // Assign the temperature derivative dataset to the secondary y-axis
          }],
        },
        options: {
          scales: {
            x: {
              display: true,
              type: 'time',
              distrubution: 'linear',
              time: {
                displayFormats: {
                  millisecond: 'h:mm:ss',
                },
              },
            },
            y: {
              display: true,
              min: -10,
              max: 300,
              title: {
                display: true,
                text: 'Temp ºC',
              },
            },
            'derivative-axis': {
              type: 'linear',
              position: 'right',
              min: -5, // Set the desired minimum value for the derivative axis
              max: 50, // Set the desired maximum value for the derivative axis,
              title: {
                display: true,
                text: 'ROR -- derivative of temperature',
              },
            },
          },
        },
      });

      tempCharacteristic.addEventListener('characteristicvaluechanged', (event) => handleTemp(event, tempChart, startTime));
    })
    .catch((error) => console.error(error));
}

const connectButton = document.getElementById('connectButton');
connectButton.addEventListener('click', connectToESP32);

function stopStreaming() {
  if (tempCharacteristic) {
    tempCharacteristic.stopNotifications()
      .then((_) => {
        console.log('Notifications stopped');
        tempCharacteristic.removeEventListener('characteristicvaluechanged', handleTemp);
      })
      .catch((error) => console.error(error));
  }

  if (device && device.gatt.connected) {
    device.gatt.disconnect();
    console.log('Device disconnected');
  }
}

const stopButton = document.getElementById('stopButton');
stopButton.addEventListener('click', stopStreaming);

function generateCSVData() {
  const temperatureData = tempChart.data.datasets[0].data;
  const tempDerivative = tempChart.data.datasets[1].data;

  const rows = temperatureData.map((point, index) => {
    const timestamp = new Date(point.x);
    const formattedTime = `${timestamp.getMinutes().toString().padStart(2, '0')}:${timestamp.getSeconds().toString().padStart(2, '0')}.${timestamp.getMilliseconds().toString().padStart(3, '0')}`;
    const temperature = point.y;
    const tempChange = tempDerivative[index] ? tempDerivative[index].y : 0;
    return `${formattedTime},${temperature},${tempChange}`;
  });

  const csvContent = `Time,Temperature,Temperature Change\n${rows.join('\n')}`;
  return csvContent;
}

function downloadCSV() {
  const csvData = generateCSVData();
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const filename = 'temperature_data.csv';

  if (navigator.msSaveBlob) { // IE 10+
    navigator.msSaveBlob(blob, filename);
  } else {
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

const downloadButton = document.getElementById('downloadButton');
downloadButton.addEventListener('click', downloadCSV);
