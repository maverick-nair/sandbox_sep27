// Country name pools for the markets authors pick most. Region styles cover every other country.
// Each row: female given names | male given names | family names. Full names are composed so a
// 20-person roster stays unique: at least 6 for "she" and 15 for "he", like the regional pools.
// familyFirst: the family name is written first (China, Korea, Vietnam).

const RAW = {
  KE: ['Wanjiru|Achieng|Njeri|Akinyi|Wambui|Chebet|Atieno|Nyambura', 'Kamau|Otieno|Brian|Kiprono|Mwangi|Odhiambo|Kevin|Wafula|Mutua|Ochieng', 'Kamau|Otieno|Mwangi|Wanjiku|Odhiambo|Kiprotich|Njoroge|Mutua|Kariuki|Omondi|Chege|Wekesa'],
  NG: ['Chiamaka|Ngozi|Funmilayo|Aisha|Temitope|Adaeze|Zainab|Yetunde', 'Chinedu|Emeka|Olumide|Tunde|Ibrahim|Obinna|Segun|Musa|Kelechi|Babajide', 'Okafor|Adeyemi|Balogun|Eze|Bello|Nwosu|Ogunleye|Abubakar|Okonkwo|Adebayo|Ibekwe|Lawal'],
  ZA: ['Thandiwe|Lerato|Naledi|Anika|Zanele|Megan|Palesa|Refilwe', 'Sipho|Thabo|Pieter|Kagiso|Johan|Lwazi|Themba|Ruan|Mandla|Tshepo', 'Nkosi|Dlamini|van der Merwe|Botha|Mokoena|Khumalo|Naidoo|Ndlovu|Pretorius|Mahlangu|Molefe|Pillay'],
  GH: ['Ama|Akosua|Abena|Efua|Adwoa|Yaa|Esi|Afua', 'Kwame|Kofi|Yaw|Kwabena|Kwaku|Kojo|Nana|Kwesi|Fiifi|Ekow', 'Mensah|Asante|Owusu|Boateng|Osei|Addo|Appiah|Agyeman|Darko|Ansah|Frimpong|Quaye'],
  EG: ['Nour|Mariam|Salma|Yasmin|Dina|Heba|Reem|Farida', 'Ahmed|Mohamed|Omar|Karim|Mostafa|Youssef|Tarek|Hany|Amr|Sherif', 'Hassan|Mahmoud|Ibrahim|Mostafa|Fathy|Saleh|Kamel|Nasser|Farouk|Abdelrahman|Gamal|Sayed'],
  SA: ['Noura|Reem|Lama|Sara|Hessa|Maha|Dana|Joud', 'Abdullah|Faisal|Khalid|Saud|Turki|Nawaf|Fahad|Majed|Sultan|Bandar', 'Al Qahtani|Al Otaibi|Al Harbi|Al Ghamdi|Al Zahrani|Al Shehri|Al Dosari|Al Mutairi|Al Anazi|Al Subaie|Al Shammari|Al Malki'],
  BR: ['Ana|Beatriz|Mariana|Juliana|Camila|Larissa|Fernanda|Gabriela', 'João|Pedro|Lucas|Rafael|Gustavo|Thiago|Bruno|Felipe|Rodrigo|Matheus', 'Silva|Souza|Oliveira|Santos|Pereira|Costa|Rodrigues|Almeida|Nascimento|Lima|Carvalho|Ribeiro'],
  MX: ['Guadalupe|Fernanda|Ximena|Mariana|Daniela|Valeria|Paola|Alejandra', 'José|Luis|Juan|Carlos|Jorge|Alejandro|Miguel|Ricardo|Eduardo|Arturo', 'Hernández|García|Martínez|López|González|Pérez|Rodríguez|Sánchez|Ramírez|Cruz|Flores|Reyes'],
  CA: ['Emma|Olivia|Chloé|Ava|Priya|Maya|Élise|Sarah', 'Liam|Noah|Étienne|Ethan|Jacob|Mathieu|Owen|Arjun|Lucas|Ryan', 'Tremblay|Smith|Roy|Wilson|MacDonald|Gagnon|Brown|Singh|Martin|Campbell|Lee|Bouchard'],
  FR: ['Camille|Léa|Manon|Chloé|Inès|Sarah|Juliette|Pauline', 'Thomas|Nicolas|Julien|Maxime|Antoine|Hugo|Mehdi|Romain|Guillaume|Karim', 'Martin|Bernard|Dubois|Laurent|Moreau|Lefèvre|Girard|Roux|Fournier|Mercier|Benali|Garnier'],
  ES: ['Lucía|María|Paula|Laura|Marta|Elena|Carmen|Andrea', 'Alejandro|Daniel|Pablo|David|Javier|Sergio|Adrián|Álvaro|Hugo|Jordi', 'García|Fernández|González|Rodríguez|López|Martínez|Sánchez|Pérez|Romero|Navarro|Torres|Puig'],
  IT: ['Giulia|Chiara|Francesca|Sara|Martina|Alessia|Elena|Valentina', 'Marco|Luca|Alessandro|Matteo|Davide|Andrea|Lorenzo|Simone|Federico|Giorgio', 'Rossi|Russo|Ferrari|Esposito|Bianchi|Romano|Colombo|Ricci|Marino|Greco|Bruno|Gallo'],
  NL: ['Sanne|Lotte|Anouk|Femke|Eva|Iris|Noor|Fleur', 'Daan|Lars|Bram|Thijs|Ruben|Sem|Jesse|Stijn|Mohamed|Joris', 'de Jong|Jansen|de Vries|van den Berg|Bakker|Visser|Smit|Meijer|Mulder|de Boer|Bos|Vos'],
  SE: ['Elin|Maja|Linnea|Ebba|Klara|Saga|Wilma|Alva', 'Erik|Johan|Oskar|Anders|Lars|Viktor|Gustav|Emil|Axel|Nils', 'Andersson|Johansson|Karlsson|Nilsson|Eriksson|Larsson|Olsson|Persson|Svensson|Lindberg|Berg|Holm'],
  PL: ['Anna|Katarzyna|Magdalena|Agnieszka|Zofia|Joanna|Aleksandra|Natalia', 'Piotr|Krzysztof|Tomasz|Paweł|Michał|Jakub|Marcin|Łukasz|Kamil|Adam', 'Nowak|Kowalski|Wiśniewski|Wójcik|Kamiński|Lewandowski|Zieliński|Szymański|Woźniak|Dąbrowski|Kaczmarek|Mazur'],
  TR: ['Zeynep|Elif|Ayşe|Merve|Selin|Deniz|Ebru|Büşra', 'Mehmet|Mustafa|Emre|Burak|Can|Murat|Serkan|Kerem|Onur|Hakan', 'Yılmaz|Kaya|Demir|Şahin|Çelik|Yıldız|Aydın|Öztürk|Arslan|Doğan|Kılıç|Koç'],
  CN: ['Fang|Jing|Li|Min|Xiu Ying|Yan|Hui|Ting', 'Wei|Jun|Hao|Lei|Yang|Tao|Ming|Qiang|Jian|Bo', 'Wang|Li|Zhang|Liu|Chen|Yang|Huang|Zhao|Wu|Zhou|Xu|Sun', true],
  KR: ['Ji-woo|Seo-yeon|Min-ji|Soo-ah|Ha-eun|Ji-min|Yu-na|Da-eun', 'Min-jun|Seo-jun|Ji-ho|Hyun-woo|Dong-hyun|Joon-young|Sung-min|Tae-yang|Jae-won|Woo-jin', 'Kim|Lee|Park|Choi|Jung|Kang|Cho|Yoon|Jang|Lim|Han|Shin', true],
  ID: ['Putri|Siti|Dewi|Ayu|Rina|Nurul|Intan|Fitri', 'Budi|Agus|Rizky|Andi|Dimas|Fajar|Hendra|Arief|Yusuf|Bayu', 'Santoso|Wijaya|Pratama|Hidayat|Saputra|Kusuma|Nugroho|Siregar|Halim|Setiawan|Gunawan|Purnomo'],
  PH: ['Maria|Angelica|Kristine|Joanna|Patricia|Camille|Andrea|Nicole', 'Juan|Mark|John Paul|Carlo|Miguel|Rafael|Jerome|Paolo|Christian|Jose', 'Santos|Reyes|Cruz|Bautista|Garcia|Mendoza|Villanueva|Ramos|Aquino|Castillo|Dela Cruz|Tan'],
  VN: ['Linh|Trang|Huong|Mai|Thao|Ngoc|Lan|Hanh', 'Minh|Tuan|Huy|Duc|Khang|Nam|Quang|Long|Phuc|Hoang', 'Nguyen|Tran|Le|Pham|Hoang|Vu|Vo|Dang|Bui|Do|Ho|Ngo', true],
  TH: ['Siriporn|Nattaya|Kanokwan|Pimchanok|Ploy|Ratchanee|Suda|Warunee', 'Somchai|Anan|Thanakorn|Kittisak|Chaiwat|Nattapong|Prasert|Sompong|Wichai|Pongsakorn', 'Saetang|Wongsa|Srisuk|Chaiyaporn|Boonmee|Rattanakul|Suwannarat|Jaidee|Thongchai|Kaewmanee|Phongphan|Sukprasert'],
  PK: ['Ayesha|Fatima|Sana|Hira|Maryam|Zainab|Mahnoor|Amna', 'Ali|Ahmed|Usman|Bilal|Hamza|Faisal|Imran|Kamran|Zeeshan|Asad', 'Khan|Malik|Butt|Qureshi|Chaudhry|Sheikh|Raza|Siddiqui|Mirza|Shah|Javed|Iqbal'],
  BD: ['Nusrat|Farzana|Tahmina|Sadia|Shirin|Rumana|Jannat|Nasrin', 'Rahim|Karim|Tanvir|Arif|Sabbir|Mahmud|Rafiq|Imtiaz|Shakil|Fahim', 'Rahman|Hossain|Islam|Ahmed|Chowdhury|Uddin|Akter|Khan|Sarkar|Das|Talukder|Miah'],
  IE: ['Aoife|Siobhán|Niamh|Ciara|Orla|Sinéad|Róisín|Clodagh', 'Seán|Cian|Darragh|Oisín|Pádraig|Conor|Eoin|Ronan|Fionn|Declan', "Murphy|Kelly|O'Sullivan|Walsh|Byrne|Ryan|O'Brien|Doyle|McCarthy|Gallagher|Kennedy|Lynch"],
  AR: ['Sofía|Valentina|Camila|Florencia|Agustina|Lucía|Martina|Julieta', 'Santiago|Matías|Facundo|Nicolás|Joaquín|Martín|Gonzalo|Federico|Tomás|Ignacio', 'González|Rodríguez|Gómez|Fernández|López|Díaz|Martínez|Pérez|Romero|Sosa|Álvarez|Benítez'],
  CO: ['Valentina|Daniela|Natalia|Laura|Carolina|Juliana|Paola|Andrea', 'Santiago|Andrés|Camilo|Felipe|Juan Pablo|Sebastián|Julián|Mauricio|Esteban|Alejandro', 'Rodríguez|Gómez|González|Martínez|García|López|Hernández|Sánchez|Ramírez|Castro|Vargas|Restrepo'],
  CL: ['Constanza|Catalina|Francisca|Javiera|Fernanda|Valentina|Camila|Antonia', 'Benjamín|Vicente|Matías|Cristóbal|Diego|Felipe|Joaquín|Rodrigo|Sebastián|Ignacio', 'González|Muñoz|Rojas|Díaz|Pérez|Soto|Contreras|Silva|Martínez|Sepúlveda|Morales|Fuentes'],
  PT: ['Inês|Beatriz|Mariana|Ana|Catarina|Sofia|Rita|Joana', 'João|Tiago|Diogo|Rui|Miguel|Pedro|Nuno|Gonçalo|André|Ricardo', 'Silva|Santos|Ferreira|Pereira|Oliveira|Costa|Rodrigues|Martins|Sousa|Fernandes|Gonçalves|Lopes'],
  GE: ['Nino|Tamar|Mariam|Ana|Salome|Natia|Eka|Keti', 'Giorgi|Davit|Levan|Nika|Irakli|Luka|Zurab|Tornike|Sandro|Lasha', 'Beridze|Kapanadze|Gelashvili|Maisuradze|Giorgadze|Lomidze|Tsiklauri|Bolkvadze|Kvaratskhelia|Nozadze|Abashidze|Mamaladze'],
  NZ: ['Aroha|Olivia|Charlotte|Mere|Isla|Grace|Ruby|Hana', 'Tama|Liam|Jack|Wiremu|Oliver|Hemi|Noah|Mason|Rawiri|George', 'Smith|Williams|Ngata|Brown|Wilson|Taylor|Parata|Anderson|Thompson|Walker|Tane|Campbell'],
};

// Family names that change with gender.
const FORMS = {
  PL: { she: (f) => f.replace(/(ski|cki|dzki)$/, (m) => `${m.slice(0, -1)}a`), he: (f) => f },
};

function compose(given, family, count, offset, familyFirst, form = (f) => f) {
  const out = [];
  for (let i = 0; out.length < count; i++) {
    const g = given[i % given.length];
    const f = form(family[(i + offset) % family.length]);
    const name = familyFirst ? `${f} ${g}` : `${g} ${f}`;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

// Malaysia mixes naming traditions, so given and family names are not combined across them.
const FULL = {
  MY: {
    she: ['Nur Aisyah binti Ismail', 'Tan Mei Ling', 'Kavitha Subramaniam', 'Farah binti Hassan', 'Lim Hui Min', 'Priya Krishnan', 'Nabila binti Yusof', 'Wong Siew Lan'],
    he: ['Ahmad Faiz bin Ismail', 'Lim Wei Liang', 'Arjun Subramaniam', 'Muhammad Hafiz bin Abdullah', 'Ng Jun Hao', 'Ravi Krishnan', 'Syafiq bin Yusof', 'Chong Kok Wai', 'Imran bin Hassan', 'Tan Chee Keong', 'Suresh Raj', 'Hakim bin Omar', 'Wong Kah Meng', 'Daniel Raj', 'Azlan bin Rahman', 'Lee Boon Hock'],
  },
};

export const COUNTRY_NAMES = Object.fromEntries(
  Object.entries(RAW).map(([code, [f, m, s, familyFirst]]) => {
    const fam = s.split('|');
    const form = FORMS[code] || {};
    return [code, { she: compose(f.split('|'), fam, 8, 0, familyFirst, form.she), he: compose(m.split('|'), fam, 16, 5, familyFirst, form.he) }];
  }).concat(Object.entries(FULL)),
);
