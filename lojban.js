const lojban2IPAMapping = {
	"«": "",
	"-": ".",
	"»": "",
	"\\?": "",
	",": "",
	"\\.": "ʔ",
	" ": " ",
	ˈ: "ˈ",
	a: "aː",
	"a\\b(?!')": "aː",
	e: "ɛ:",
	"e\\b(?!')": "ɛ:ʔ",
	i: "i:",
	o: "ɔ:",
	u: "u:",
	y: "ə",
	ą: "aj",
	ę: "ɛj",
	"ę\\b(?!')": "ɛjʔ",
	ǫ: "ɔj",
	ḁ: "aʊ",
	ɩa: "jaː",
	ɩe: "jɛ:",
	ɩi: "ji:",
	ɩo: "jɔ:",
	ɩu: "ju:",
	ɩy: "jə",
	ɩ: "j",
	wa: "waː",
	we: "wɛ:",
	wi: "wi:",
	wo: "wɔ:",
	wu: "wu:",
	wy: "wə",
	w: "w",
	c: "ʃ",
	j: "ʒ",
	s: "s",
	z: "z",
	f: "f",
	ev: "ɛ:ʔv",
	v: "v",
	x: "x",
	"'": "h",
	dj: "dʒ",
	tc: "tʃ",
	dz: "ʣ",
	ts: "ʦ",
	"r(?=[^aeiouyḁąęǫ])": "rr.",
	"r(?=[aeiouyḁąęǫ])": "ɹ",
	n: "n",
	m: "m",
	l: "l",
	b: "b",
	d: "d",
	g: "g",
	k: "k",
	p: "p",
	t: "t",
	h: "h",
};

function matchForm(word, form) {
	let regex = "^";
	const working = word.replace(/[\.\?»«]/g, "");
	for (let f = 0; f < form.length; f++) {
		if (form[f] == "?") regex += ".";
		else if (form[f] == "*") regex += ".*";
		else if (form[f] == "y") regex += "y";
		else if (form[f] == "h") regex += "h";
		else if (form[f] == "I") regex += "[iu]";
		else if (form[f] == "C") regex += "[^aeiouyḁąęǫ]";
		else if (form[f] == "V") regex += "[aeiouyḁąęǫ]";
	}
	regex += "$";
	const re = new RegExp(regex);
	return re.test(working);
}

function getValByKeyRegex(json, testedString) {
	const match =
		Object.keys(json)
			.filter((key) => RegExp(`^${key}`).test(testedString))
			.sort((a, b) => b.length - a.length)[0] ?? "-";
	return { match, value: json[match] };
}

function text2SSML(textToSpeak, queryLanguage) {
	let famymaho = [];
	switch (queryLanguage) {
		case "loglan":
			famymaho = ["gu", "guu", "guo"];
			break;
		default:
			famymaho = ["kei", "vau", "ku'o", "li'u", "le'u", "ge'u", "zo'u"];
	}
	// const stresslessWords = ["lo","le","lei","loi","ku"]
	const words = textToSpeak.replace(/(?:\r\n|\r|\n)/g, " ").split(" ");
	let output = [`<speak><prosody rate="slow">`, "<s>"];
	for (let w = 0; w < words.length; w++) {
		const currentWord = krulermorna(words[w]);
		// const nextWord = words[w + 1]
		if (["i", ".i", "ni'o"].includes(currentWord)) {
			output.push("</s>\n<s>");
		} else if (currentWord[0] == ".") {
			output.push('<break time="20ms" strength="x-weak" />');
		}

		let ph = [];
		for (let i = 0; i < [...currentWord].length; i++) {
			// if (matchForm(currentWord, "CV") && (i == 0) && nextWord && !isBrivla(nextWord) && !stresslessWords.includes(currentWord))
			//   ph.push('ˈ');
			if (matchForm(currentWord, "VCV") && i == 0) ph.push("ˈ");
			else if (matchForm(currentWord, "CVCV") && i == 0) ph.push("ˈ");
			else if (matchForm(currentWord, "VCCV") && i == 0) ph.push("ˈ");
			else if (
				matchForm(currentWord, "CVCCI") ||
				matchForm(currentWord, "CVCCV") ||
				matchForm(currentWord, "IVCCV") ||
				matchForm(currentWord, "CCVCV")
			) {
				if (i == 0) ph.push("ˈ");
				if (i == 3) ph.push(".");
			} else if (matchForm(currentWord, "CCVCCV")) {
				if (i == 0) ph.push("ˈ");
				if (i == 4) ph.push(".");
			} else if (matchForm(currentWord, "CCCVCCV")) {
				if (i == 0) ph.push("ˈ");
				if (i == 5) ph.push(".");
			} else if (matchForm(currentWord, "CCVCVCV")) {
				if (i == 3) ph.push(".ˈ");
				if (i == 5) ph.push(".");
			} else if (matchForm(currentWord, "CVCCVCV")) {
				if (i == 3) ph.push(".ˈ");
				if (i == 5) ph.push(".");
			} else if (matchForm(currentWord, "CVCyCVhV")) {
				if (i == 4) ph.push(".ˈ");
				if (i == 6) ph.push(".");
			} else if (matchForm(currentWord, "CCVCVCCV")) {
				if (i == 3) ph.push(".ˈ");
				if (i == 6) ph.push(".");
			} else if (matchForm(currentWord, "CVCCVCCV")) {
				if (i == 3) ph.push(".ˈ");
				if (i == 6) ph.push(".");
			}
			const { match, value } = getValByKeyRegex(
				lojban2IPAMapping,
				currentWord.slice(i) +
					" " +
					words
						.concat("")
						.slice(w + 1)
						.join(" ")
			);
			ph.push(value);
			i = i - 1 + match.replace(/\\/g, "").replace(/\(\?.*\)/g, "").length;
		}

		const { C, V, I } = getPhonemeClasses();
		if (RegExp(`(${C})$`).test(currentWord)) {
			ph.unshift("ʔ");
		}
		if (RegExp(`^(${V}|${I})`).test(currentWord)) {
			ph.unshift("ʔ");
		}
		// if (["mo", "ma", "xu", "xo"].includes(currentWord)) {
		//   output.push(`<prosody volume="loud">`);
		//   output.push(`<phoneme alphabet="ipa" ph="${ph.join("")}">${currentWord}</phoneme>`);
		//   output.push(`</prosody>`);
		// }else{
		const compiledWord = ph.join("").replace(/ʔ+/g, "ʔ").replace(/\.+/g, ".");
		output.push(
			`<phoneme alphabet="ipa" ph="${compiledWord}">${currentWord}</phoneme>`
		);
		// }
		if (
			currentWord[currentWord.length - 1] == "." ||
			famymaho.includes(currentWord) ||
			RegExp(`(${C})$`).test(currentWord)
		) {
			output.push(`<break time="1ms" strength="x-weak" />`);
		}
	}

	output.push("</s>", "</prosody></speak>");
	return output.join("\n");
}
function krulermorna(text) {
	return text
		.replace(/\./g, "")
		.replace(/^/, ".")
		.toLowerCase()
		.replace(/([aeiou\.])u([aeiou])/g, "$1w$2")
		.replace(/([aeiou\.])i([aeiou])/g, "$1ɩ$2")
		.replace(/au/g, "ḁ")
		.replace(/ai/g, "ą")
		.replace(/ei/g, "ę")
		.replace(/oi/g, "ǫ")
		.replace(/\./g, "");
}
function getPhonemeClasses() {
	const C = "[bdgjvzcfkpstxlmnr]";
	const V = "(a|e|i|o|u)";
	const I = "(ai|ei|oi|au|ḁ|ą|ę|ǫ)";
	const D =
		"(pl|pr|fl|fr|bl|br|vl|vr|cp|cf|ct|ck|cm|cn|cl|cr|jb|jv|jd|jg|jm|sp|sf|st|sk|sm|sn|sl|sr|zb|zv|zd|zg|zm|tc|tr|ts|kl|kr|dj|dr|dz|gl|gr|ml|mr|xl|xr)";
	const T =
		"(cfr|cfl|sfr|sfl|jvr|jvl|zvr|zvl|cpr|cpl|spr|spl|jbr|jbl|zbr|zbl|ckr|ckl|skr|skl|jgr|jgl|zgr|zgl|ctr|str|jdr|zdr|cmr|cml|smr|sml|jmr|jml|zmr|zml)";
	const R = `((?!${D})${C}${C})`;
	const J = "(i|u)(?=[aeiouyḁąęǫ])";
	const h = "[h']";
	return { C, V, I, D, T, R, J, h };
}

module.exports = { text2SSML };
