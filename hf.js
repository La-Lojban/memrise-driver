//request endpoint
//get file name
//download file name
//convert to mp3
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const util = require("util");
const stream = require("stream");
const pipeline = util.promisify(stream.pipeline);

function prettifyText(text) {
	return text.replace(/[^a-zA-Z0-9 ]/g, "");
}

async function fetchAudio({ url, text, type }) {
	const fileName = `./vitci/${prettifyText(text)}.${type}`;
	if (fs.existsSync(path.join(__dirname, fileName))) return fileName;

	let url_files = url.split("/");
	url_files.splice(url_files.length - 2, 2);
	url_files = url_files.join("/")+"/file="

	const { data } = await axios.post(url, {
		data: [text, "Lojban", 0.667, 0.8, 1.8, "LJS", type],
	});
	const [ipa, wav] = data.data;

	const request = await axios.get(`${url_files}${wav.name}`, {
		responseType: "stream",
	});
	await pipeline(request.data, fs.createWriteStream(fileName));
	return fileName;
}

module.exports = fetchAudio;
