// Latin-spelled Indian names -> Devanagari (Hindi / Marathi) and Gujarati script.
// Used by the API (labourers.name_hi) and by the phone (guard-typed names, Gujarati display).
// Strategy: a dictionary of common name words first, then a phonetic fallback. Admin can
// correct any result in Admin -> Labourers.

// Word dictionary (lower-case Latin -> Devanagari). Covers the common first names, surnames
// and nicknames seen on Maharashtra / Gujarat / UP / Bihar musters.
const WORDS: Record<string, string> = {
  // surnames / caste names
  kumar: 'कुमार', singh: 'सिंह', sinh: 'सिंह', sihn: 'सिंह', yadav: 'यादव', yadaw: 'यादव', paswan: 'पासवान', parmar: 'परमार', patel: 'पटेल', patil: 'पाटील',
  sharma: 'शर्मा', verma: 'वर्मा', varma: 'वर्मा', gupta: 'गुप्ता', mishra: 'मिश्रा', misra: 'मिश्रा', tiwari: 'तिवारी', tiwary: 'तिवारी', pandey: 'पांडे', pande: 'पांडे', dubey: 'दुबे', dube: 'दुबे',
  shukla: 'शुक्ला', rajbhar: 'राजभर', ansari: 'अंसारी', shaikh: 'शेख', sheikh: 'शेख', shekh: 'शेख', khan: 'खान', pathan: 'पठाण', qureshi: 'कुरैशी', siddiqui: 'सिद्दीकी', salmani: 'सलमानी',
  mahajan: 'महाजन', kalaskar: 'कळसकर', surve: 'सुर्वे', naik: 'नाईक', mehtar: 'मेहतर', gore: 'गोरे', more: 'मोरे', pillay: 'पिल्लै', pillai: 'पिल्लै', kushwaha: 'कुशवाहा', kushwah: 'कुशवाह',
  vishvakarma: 'विश्वकर्मा', vishwakarma: 'विश्वकर्मा', mer: 'मेर', harijan: 'हरिजन', jadhav: 'जाधव', shinde: 'शिंदे', pawar: 'पवार', kale: 'काळे', kadam: 'कदम', bhosale: 'भोसले', bhosle: 'भोसले',
  gaikwad: 'गायकवाड', chavan: 'चव्हाण', chauhan: 'चौहान', chouhan: 'चौहान', deshmukh: 'देशमुख', kulkarni: 'कुलकर्णी', joshi: 'जोशी', thakur: 'ठाकुर', thakor: 'ठाकोर', rathod: 'राठोड', rathore: 'राठौड़',
  solanki: 'सोलंकी', vaghela: 'वाघेला', chaudhary: 'चौधरी', choudhary: 'चौधरी', chaudhari: 'चौधरी', choudhury: 'चौधरी', prajapati: 'प्रजापति', vasava: 'वसावा', tadvi: 'तडवी', rabari: 'रबारी', bharwad: 'भरवाड',
  makwana: 'मकवाणा', gohil: 'गोहिल', dabhi: 'डाभी', zala: 'झाला', jhala: 'झाला', mali: 'माळी', koli: 'कोळी', bhoi: 'भोई', sahu: 'साहू', sahani: 'सहनी', sahni: 'सहनी', mahto: 'महतो', mahato: 'महतो',
  mandal: 'मंडल', das: 'दास', ram: 'राम', rai: 'राय', roy: 'रॉय', prasad: 'प्रसाद', lal: 'लाल', nath: 'नाथ', mondal: 'मंडल', manjhi: 'मांझी', majhi: 'माझी', nishad: 'निषाद', bind: 'बिंद', maurya: 'मौर्य',
  pal: 'पाल', rajput: 'राजपूत', saini: 'सैनी', jat: 'जाट', gujjar: 'गुर्जर', gurjar: 'गुर्जर', bhil: 'भील', gond: 'गोंड', oraon: 'उरांव', munda: 'मुंडा', tudu: 'टुडू', soren: 'सोरेन', murmu: 'मुर्मू',
  sonar: 'सोनार', lohar: 'लोहार', sutar: 'सुतार', kumbhar: 'कुंभार', chamar: 'चमार', dhobi: 'धोबी', nai: 'नाई', teli: 'तेली', kurmi: 'कुर्मी', kori: 'कोरी', khatik: 'खटीक', valmiki: 'वाल्मीकि',
  agarwal: 'अग्रवाल', agrawal: 'अग्रवाल', jain: 'जैन', shah: 'शाह', mehta: 'मेहता', desai: 'देसाई', trivedi: 'त्रिवेदी', dave: 'दवे', bhatt: 'भट्ट', vyas: 'व्यास', pandya: 'पंड्या', modi: 'मोदी',
  // muslim names
  mohammad: 'मोहम्मद', mohammed: 'मोहम्मद', muhammad: 'मोहम्मद', mohd: 'मोहम्मद', md: 'मो.', ahmed: 'अहमद', ahmad: 'अहमद', ali: 'अली', rahman: 'रहमान', rehman: 'रहमान', juman: 'जुमन', abu: 'अबू',
  sohail: 'सोहेल', suhail: 'सुहैल', samir: 'समीर', sameer: 'समीर', jamshed: 'जमशेद', irfan: 'इरफ़ान', imran: 'इमरान', salman: 'सलमान', shakil: 'शकील', shakeel: 'शकील', rashid: 'रशीद', rasheed: 'रशीद',
  aslam: 'असलम', akram: 'अकरम', anwar: 'अनवर', arif: 'आरिफ़', asif: 'आसिफ़', nadeem: 'नदीम', naeem: 'नईम', firoz: 'फ़िरोज़', feroz: 'फ़िरोज़', yusuf: 'युसुफ़', yunus: 'युनुस', ismail: 'इस्माइल', ibrahim: 'इब्राहिम',
  hussain: 'हुसैन', husain: 'हुसैन', hasan: 'हसन', hassan: 'हसन', karim: 'करीम', kareem: 'करीम', rahim: 'रहीम', raheem: 'रहीम', shabbir: 'शब्बीर', sabir: 'साबिर', tahir: 'ताहिर', zakir: 'ज़ाकिर', javed: 'जावेद',
  jamal: 'जमाल', kamal: 'कमल', iqbal: 'इक़बाल', taufik: 'तौफ़ीक', taufiq: 'तौफ़ीक', mustak: 'मुश्ताक', mushtaq: 'मुश्ताक', shamim: 'शमीम', nasir: 'नासिर', naseer: 'नसीर', wasim: 'वसीम', waseem: 'वसीम',
  // first names
  ramesh: 'रमेश', suresh: 'सुरेश', mahesh: 'महेश', ganesh: 'गणेश', rajesh: 'राजेश', rakesh: 'राकेश', mukesh: 'मुकेश', dinesh: 'दिनेश', naresh: 'नरेश', umesh: 'उमेश', yogesh: 'योगेश', lokesh: 'लोकेश',
  nilesh: 'निलेश', hitesh: 'हितेश', jitesh: 'जितेश', ritesh: 'रितेश', mitesh: 'मितेश', paresh: 'परेश', kalpesh: 'कल्पेश', alpesh: 'अल्पेश', bhavesh: 'भावेश', jignesh: 'जिग्नेश',
  santosh: 'संतोष', manish: 'मनीष', ashish: 'आशीष', ashok: 'अशोक', vinod: 'विनोद', pramod: 'प्रमोद', manoj: 'मनोज', sanjay: 'संजय', vijay: 'विजय', ajay: 'अजय', sujay: 'सुजय', jay: 'जय', jai: 'जय',
  sunil: 'सुनील', anil: 'अनिल', dilip: 'दिलीप', dipak: 'दीपक', deepak: 'दीपक', dipesh: 'दीपेश', pradip: 'प्रदीप', pradeep: 'प्रदीप', sandip: 'संदीप', sandeep: 'संदीप', mandeep: 'मनदीप', kuldeep: 'कुलदीप', kuldip: 'कुलदीप',
  jagdish: 'जगदीश', atmaram: 'आत्माराम', sitaram: 'सीताराम', tukaram: 'तुकाराम', pandurang: 'पांडुरंग', dattatray: 'दत्तात्रय', dattatraya: 'दत्तात्रय', datta: 'दत्ता', vitthal: 'विठ्ठल', vithal: 'विठ्ठल',
  dyaneshwar: 'ज्ञानेश्वर', dnyaneshwar: 'ज्ञानेश्वर', gyaneshwar: 'ज्ञानेश्वर', dnyandev: 'ज्ञानदेव', shankar: 'शंकर', shankarrao: 'शंकरराव', mahadev: 'महादेव', sadashiv: 'सदाशिव', shivaji: 'शिवाजी',
  swapnil: 'स्वप्निल', hrushikesh: 'हृषिकेश', hrishikesh: 'हृषिकेश', rajguru: 'राजगुरु', avnish: 'अवनीश', avinash: 'अविनाश', aditya: 'आदित्य', arjun: 'अर्जुन', abhay: 'अभय', anuj: 'अनुज', avdhesh: 'अवधेश',
  hari: 'हरि', nirmal: 'निर्मल', golu: 'गोलू', monu: 'मोनू', bolu: 'बोलू', sonu: 'सोनू', chhotu: 'छोटू', chotu: 'छोटू', pappu: 'पप्पू', bablu: 'बबलू', guddu: 'गुड्डू', raju: 'राजू', rahul: 'राहुल', rohit: 'रोहित',
  rakendra: 'राकेंद्र', rajendra: 'राजेंद्र', mahendra: 'महेंद्र', surendra: 'सुरेंद्र', narendra: 'नरेंद्र', devendra: 'देवेंद्र', virendra: 'वीरेंद्र', virendar: 'वीरेंद्र', virender: 'वीरेंद्र', jitendra: 'जितेंद्र', jitender: 'जितेंद्र',
  dharmendra: 'धर्मेंद्र', dharmender: 'धर्मेंद्र', ravindra: 'रवींद्र', ravinder: 'रविंदर', harindra: 'हरींद्र', harinder: 'हरिंदर', upendra: 'उपेंद्र', gajendra: 'गजेंद्र', yogendra: 'योगेंद्र', shailendra: 'शैलेंद्र',
  chandresh: 'चंद्रेश', chandan: 'चंदन', chandra: 'चंद्र', chander: 'चंदर', shyam: 'श्याम', ghanshyam: 'घनश्याम', radheshyam: 'राधेश्याम', ramji: 'रामजी', lakhan: 'लखन', laxman: 'लक्ष्मण', lakshman: 'लक्ष्मण',
  sagar: 'सागर', sujeet: 'सुजीत', sujit: 'सुजीत', ranjit: 'रंजीत', ranjeet: 'रंजीत', ajit: 'अजीत', ajeet: 'अजीत', amit: 'अमित', sumit: 'सुमित', lalit: 'ललित', mohit: 'मोहित', ankit: 'अंकित', vinit: 'विनीत', vineet: 'विनीत',
  vinay: 'विनय', vikas: 'विकास', vikash: 'विकास', vikram: 'विक्रम', vivek: 'विवेक', vishal: 'विशाल', vishnu: 'विष्णु', suraj: 'सूरज', sooraj: 'सूरज', suren: 'सुरेन', karan: 'करण', kiran: 'किरण', arvind: 'अरविंद', aravind: 'अरविंद',
  mithun: 'मिथुन', prem: 'प्रेम', rajan: 'राजन', raj: 'राज', ramu: 'रामू', shyamu: 'श्यामू', kanhiya: 'कन्हैया', kanhaiya: 'कन्हैया', kanhaiyalal: 'कन्हैयालाल', manjulal: 'मंजुलाल', jivan: 'जीवन', jeevan: 'जीवन',
  natvar: 'नटवर', natwar: 'नटवर', chiman: 'चिमन', dharmveer: 'धर्मवीर', dharamveer: 'धर्मवीर', dharmvir: 'धर्मवीर', balveer: 'बलवीर', balvir: 'बलवीर', ranveer: 'रणवीर', ranvir: 'रणवीर', mahaveer: 'महावीर', mahavir: 'महावीर',
  kaka: 'काका', bhai: 'भाई', ben: 'बेन', bhaiya: 'भैया', dada: 'दादा', mama: 'मामा', baba: 'बाबा', bapu: 'बापू', anna: 'अण्णा', appa: 'अप्पा', tatya: 'तात्या', nana: 'नाना', bhau: 'भाऊ',
  bharat: 'भरत', prakash: 'प्रकाश', omprakash: 'ओमप्रकाश', om: 'ओम', jaiprakash: 'जयप्रकाश', anand: 'आनंद', amar: 'अमर', amol: 'अमोल', akash: 'आकाश', akshay: 'अक्षय', ankush: 'अंकुश', nitin: 'नितिन', sachin: 'सचिन',
  pravin: 'प्रवीण', praveen: 'प्रवीण', navin: 'नवीन', naveen: 'नवीन', ravi: 'रवि', ravikant: 'रविकांत', shashi: 'शशि', shashikant: 'शशिकांत', ramakant: 'रमाकांत', umakant: 'उमाकांत', laxmikant: 'लक्ष्मीकांत',
  gopal: 'गोपाल', gopi: 'गोपी', krishna: 'कृष्णा', krishan: 'कृष्ण', kishan: 'किशन', kishor: 'किशोर', kishore: 'किशोर', mohan: 'मोहन', sohan: 'सोहन', rohan: 'रोहन', madan: 'मदन', ratan: 'रतन', chetan: 'चेतन', ketan: 'केतन',
  balram: 'बलराम', balaram: 'बलराम', bhola: 'भोला', bholu: 'भोलू', bhagwan: 'भगवान', bhagwat: 'भागवत', bhupendra: 'भूपेंद्र', bhupesh: 'भूपेश', brijesh: 'बृजेश', birju: 'बिरजू', brij: 'बृज', braj: 'ब्रज',
  deepu: 'दीपू', dipu: 'दीपू', dev: 'देव', deva: 'देवा', devi: 'देवी', durga: 'दुर्गा', dilipkumar: 'दिलीपकुमार', ganpat: 'गणपत', ganpati: 'गणपति', gulab: 'गुलाब', gulshan: 'गुलशन',
  hemant: 'हेमंत', harish: 'हरीश', harsh: 'हर्ष', harshad: 'हर्षद', hiren: 'हिरेन', hitendra: 'हितेंद्र', indra: 'इंद्र', inder: 'इंदर', ishwar: 'ईश्वर', jagan: 'जगन', jagat: 'जगत', jagannath: 'जगन्नाथ',
  janak: 'जनक', jaydeep: 'जयदीप', jaydip: 'जयदीप', jayesh: 'जयेश', jayant: 'जयंत', kailash: 'कैलाश', kalyan: 'कल्याण', kamlesh: 'कमलेश', kanhu: 'कान्हू', kapil: 'कपिल', kartik: 'कार्तिक',
  lalu: 'लालू', lallan: 'ललन', lalan: 'ललन', mahadeo: 'महादेव', mangal: 'मंगल', mangesh: 'मंगेश', manohar: 'मनोहर', mansukh: 'मनसुख', mayur: 'मयूर', milind: 'मिलिंद', mukund: 'मुकुंद', nagesh: 'नागेश',
  nandu: 'नंदू', nand: 'नंद', nandkishor: 'नंदकिशोर', narayan: 'नारायण', natu: 'नटू', nikhil: 'निखिल', nitesh: 'नितेश', pankaj: 'पंकज', parag: 'पराग', pintu: 'पिंटू', prabhu: 'प्रभु',
  prashant: 'प्रशांत', pratap: 'प्रताप', prithvi: 'पृथ्वी', pushpendra: 'पुष्पेंद्र', raghu: 'रघु', raghunath: 'रघुनाथ', rajaram: 'राजाराम', rajkumar: 'राजकुमार', rajnish: 'रजनीश',
  ramchandra: 'रामचंद्र', ramdas: 'रामदास', ramnath: 'रामनाथ', ramprasad: 'रामप्रसाद', rambabu: 'रामबाबू', ramvilas: 'रामविलास', rana: 'राणा', ranjan: 'रंजन', ratnesh: 'रत्नेश',
  sadanand: 'सदानंद', sahil: 'साहिल', sanjeev: 'संजीव', sanjiv: 'संजीव', sanju: 'संजू', sarvesh: 'सर्वेश', satish: 'सतीश', satyam: 'सत्यम', satendra: 'सत्येंद्र', satyendra: 'सत्येंद्र', shailesh: 'शैलेश',
  sharad: 'शरद', shekhar: 'शेखर', shivam: 'शिवम', shiv: 'शिव', shiva: 'शिवा', shravan: 'श्रवण', shubham: 'शुभम', siddharth: 'सिद्धार्थ', subhash: 'सुभाष', sudhir: 'सुधीर',
  sukhdev: 'सुखदेव', sukhram: 'सुखराम', sultan: 'सुल्तान', sumeet: 'सुमीत', sunny: 'सनी', suryakant: 'सूर्यकांत', tarun: 'तरुण', tejas: 'तेजस', tulsi: 'तुलसी', uday: 'उदय', uttam: 'उत्तम',
  vasant: 'वसंत', vasudev: 'वासुदेव', ved: 'वेद', vedprakash: 'वेदप्रकाश', vilas: 'विलास', vimal: 'विमल', vipin: 'विपिन', vipul: 'विपुल', vishwas: 'विश्वास', vishwanath: 'विश्वनाथ', yash: 'यश', yashwant: 'यशवंत',
  bhavin: 'भाविन', bhavik: 'भाविक', chirag: 'चिराग', darshan: 'दर्शन', dhaval: 'धवल', dhruv: 'ध्रुव', dharmesh: 'धर्मेश', hardik: 'हार्दिक', jatin: 'जतिन', kaushik: 'कौशिक', kirit: 'किरीट',
  mehul: 'मेहुल', nayan: 'नयन', nayankumar: 'नयनकुमार', piyush: 'पीयूष', rajnikant: 'रजनीकांत', rajni: 'रजनी', rasik: 'रसिक', ravji: 'रवजी', sanjaykumar: 'संजयकुमार', tushar: 'तुषार',
  vinu: 'विनु', viren: 'वीरेन', bhikha: 'भीखा', bhikhabhai: 'भीखाभाई', dinu: 'दीनू', jethabhai: 'जेठाभाई', jetha: 'जेठा', kanu: 'कनु', karsan: 'करसन', mafat: 'मफत', maganbhai: 'मगनभाई', magan: 'मगन',
  naran: 'नारण', natvarbhai: 'नटवरभाई', shantilal: 'शांतिलाल', somabhai: 'सोमाभाई', soma: 'सोमा', vallabh: 'वल्लभ', valji: 'वलजी', vinodbhai: 'विनोदभाई', ashokbhai: 'अशोकभाई',
  chand: 'चंद', tej: 'तेज', bal: 'बल', mahi: 'मही', sudama: 'सुदामा', sah: 'सह', nag: 'नाग', bhup: 'भूप', jag: 'जग', deo: 'देव', kant: 'कांत', dhar: 'धर', shri: 'श्री', sri: 'श्री', kumari: 'कुमारी', bai: 'बाई', tai: 'ताई', mata: 'माता', pati: 'पति', ratna: 'रत्न', shanti: 'शांति', lakshmi: 'लक्ष्मी', laxmi: 'लक्ष्मी', mangla: 'मंगला', hira: 'हीरा', heera: 'हीरा', moti: 'मोती', kalu: 'कालू', kallu: 'कल्लू', bittu: 'बिट्टू', chintu: 'चिंटू', tinku: 'टिंकू', vicky: 'विक्की', rinku: 'रिंकू', munna: 'मुन्ना', chhote: 'छोटे', chote: 'छोटे',
  k: 'के', s: 'एस', r: 'आर', m: 'एम', p: 'पी', d: 'डी', b: 'बी', v: 'वी', n: 'एन', a: 'ए', j: 'जे', g: 'जी', h: 'एच', l: 'एल', t: 'टी', c: 'सी', y: 'वाय', u: 'यू', i: 'आई', o: 'ओ', e: 'ई', w: 'डब्ल्यू', f: 'एफ', q: 'क्यू', x: 'एक्स', z: 'ज़ेड'
}

// Phonetic fallback tables (longest match first).
const CONS: [string, string][] = [
  ['chh', 'छ'], ['ksh', 'क्ष'], ['dny', 'ज्ञ'], ['gy', 'ज्ञ'], ['shr', 'श्र'], ['tth', 'ठ'], ['ddh', 'ढ'],
  ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['th', 'थ'], ['dh', 'ध'], ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['zh', 'झ'], ['ny', 'न्य'],
  ['k', 'क'], ['q', 'क'], ['g', 'ग'], ['c', 'क'], ['j', 'ज'], ['z', 'ज़'], ['t', 'त'], ['d', 'द'], ['n', 'न'], ['p', 'प'], ['f', 'फ'], ['b', 'ब'], ['m', 'म'],
  ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'], ['x', 'क्स'],
]
// vowel -> [independent form, matra]
const VOW: [string, string, string][] = [
  ['aa', 'आ', 'ा'], ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'], ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'], ['oo', 'ऊ', 'ू'], ['ou', 'औ', 'ौ'],
  ['a', 'अ', ''], ['i', 'इ', 'ि'], ['u', 'उ', 'ु'], ['e', 'ए', 'े'], ['o', 'ओ', 'ो'],
]
const HALANT = '्'
const ANUSVARA = 'ं'

type Tok = { kind: 'c'; dev: string; lat: string } | { kind: 'v'; ind: string; matra: string; lat: string }

function tokenize(word: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < word.length) {
    let hit = false
    for (const [lat, dev] of CONS) {
      if (word.startsWith(lat, i)) { toks.push({ kind: 'c', dev, lat }); i += lat.length; hit = true; break }
    }
    if (hit) continue
    for (const [lat, ind, matra] of VOW) {
      if (word.startsWith(lat, i)) { toks.push({ kind: 'v', ind, matra, lat }); i += lat.length; hit = true; break }
    }
    if (!hit) i++ // unknown character: drop
  }
  return toks
}

/** Phonetic Latin -> Devanagari for one lower-case word. */
export function phonetic(word: string): string {
  const toks = tokenize(word)
  // Heuristic: a short 'i' in the last syllable before a final consonant is usually long (Dilip, Sunil, Ranjit).
  const lastV = [...toks].reverse().findIndex((t) => t.kind === 'v')
  const lastVi = lastV === -1 ? -1 : toks.length - 1 - lastV
  if (lastVi >= 0 && lastVi < toks.length - 1 && toks[lastVi].kind === 'v' && toks[lastVi].lat === 'i' && toks.slice(lastVi + 1).every((t) => t.kind === 'c')) {
    toks[lastVi] = { kind: 'v', ind: 'ई', matra: 'ी', lat: 'ee' }
  }
  // Heuristic: a final 'a' after a consonant is a long ā (Shukla, Kushwaha), except after 'y' following a consonant (Aditya, Satya).
  const last = toks[toks.length - 1]
  if (last && last.kind === 'v' && last.lat === 'a' && toks.length >= 2 && toks[toks.length - 2].kind === 'c') {
    const prev = toks[toks.length - 2]
    const silent = prev.kind === 'c' && prev.lat === 'y' && toks.length >= 3 && toks[toks.length - 3].kind === 'c'
    toks[toks.length - 1] = silent ? { kind: 'v', ind: '', matra: '', lat: 'a' } : { kind: 'v', ind: 'आ', matra: 'ा', lat: 'aa' }
  }
  let out = ''
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    const next = toks[i + 1]
    if (t.kind === 'v') {
      const prev = toks[i - 1]
      out += prev && prev.kind === 'c' ? t.matra : t.ind
      continue
    }
    // consonant
    if (next && next.kind === 'c') {
      // nasal before a consonant becomes anusvara: Santosh, Chandan, Sampat
      if ((t.lat === 'n' && !['h', 'y'].includes(next.lat)) || (t.lat === 'm' && ['p', 'b', 'bh', 'ph'].includes(next.lat))) { out += ANUSVARA; continue }
      out += t.dev + HALANT
    } else {
      out += t.dev
    }
  }
  return out
}

const SUFFIXES: [string, string][] = [['bhai', 'भाई'], ['ben', 'बेन'], ['kumar', 'कुमार'], ['lal', 'लाल'], ['rao', 'राव'], ['ji', 'जी'], ['endra', 'ेंद्र'], ['ender', 'ेंदर'], ['inder', 'िंदर'], ['eshwar', 'ेश्वर'], ['esh', 'ेश'], ['nath', 'नाथ'], ['chand', 'चंद'], ['prasad', 'प्रसाद'], ['anand', 'ानंद'], ['pal', 'पाल'], ['deep', 'दीप'], ['dip', 'दीप'], ['veer', 'वीर'], ['vir', 'वीर'], ['kant', 'कांत'], ['nand', 'नंद']]

function known(lower: string): string | null {
  if (WORDS[lower]) return WORDS[lower]
  // compound of two known words: Ram+Naresh, Lal+Chand, Bal+Kishan
  for (let i = lower.length - 2; i >= 2; i--) {
    const left = WORDS[lower.slice(0, i)]
    const right = WORDS[lower.slice(i)]
    if (left && right) return left + right
  }
  return null
}

function word(w: string): string {
  const lower = w.toLowerCase()
  const hit = known(lower)
  if (hit) return hit
  for (const [suf, dev] of SUFFIXES) {
    if (lower.length > suf.length + 2 && lower.endsWith(suf)) {
      const base = lower.slice(0, -suf.length)
      return (known(base) ?? phonetic(base)) + dev
    }
  }
  return phonetic(lower)
}

/** Whole name (words, initials, brackets) -> Devanagari. Non-letters are kept as they are. */
export function toDevanagari(name: string): string {
  return name.replace(/[A-Za-z]+/g, (w) => word(w))
}

const DEV_START = 0x0900, DEV_END = 0x097f, GUJ_OFFSET = 0x180
/** Devanagari -> Gujarati script (same code-point layout). Nukta forms are decomposed first. */
export function devanagariToGujarati(s: string): string {
  return s.normalize('NFD').replace(/[ऀ-ॿ]/g, (ch) => {
    const cp = ch.charCodeAt(0)
    if (cp < DEV_START || cp > DEV_END) return ch
    if (ch === 'ळ') return 'ળ'
    if (ch === '।') return '.'
    return String.fromCharCode(cp + GUJ_OFFSET)
  })
}

export function toGujarati(name: string): string {
  return devanagariToGujarati(toDevanagari(name))
}

/** True when the string already contains Devanagari or Gujarati letters. */
export function hasIndicScript(s: string): boolean {
  return /[ऀ-ॿ઀-૿]/.test(s)
}

/** name_hi for a labourer: the stored Devanagari name, or one generated from the Latin name. */
export function nativeName(name: string): string {
  return hasIndicScript(name) ? name : toDevanagari(name)
}
