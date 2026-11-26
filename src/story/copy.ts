// The story's words, in English and Arabic. Code inside a sentence is written between `backticks`
// so it keeps its left-to-right order inside Arabic text.
export type Two = [string, string];

export const NAMES: Two[] = [
  ['One line', 'سطر واحد'], ['The machine', 'الآلة'], ['Bytes', 'البايتات'], ['Pass 1', 'Pass 1'], ['Pass 2', 'Pass 2'],
  ['Addressing', 'العنونة'], ['Formats', 'الصيغ'], ['Object program', 'Object program'], ['Loader', 'Loader'], ['Run', 'التنفيذ'], ['Your turn', 'دورك'],
];

export const UI = {
  skip: ['Skip to the lab', 'انتقل إلى المحاكاة'] as Two,
  lang: ['عربي', 'English'] as Two,
  langLabel: ['Switch to Arabic', 'التبديل إلى الإنجليزية'] as Two,
  hint: ['Scroll to assemble', 'مرّر لتجمّع'] as Two,
  keys: ['or press Space', 'أو اضغط مفتاح المسافة'] as Two,
  chapters: ['Chapters', 'الفصول'] as Two,
  of: ['of', 'من'] as Two,
};

export const T = {
  hero: {
    h: ['You write one line.', 'أنت تكتب سطرًا واحدًا.'] as Two,
    m: ['The machine reads 05 00 01.', 'والآلة تقرأ `05 00 01`.'] as Two,
    p: ['Between the two stands the assembler. Scroll to follow one small program through it, from source text to a running machine.',
      'وبينهما يقف المجمّع. مرّر الصفحة لتتبع برنامجًا صغيرًا واحدًا خلاله، من النص المصدري إلى آلة تعمل.'] as Two,
  },
  machine: {
    h: ['First, the machine.', 'أولًا: الآلة.'] as Two,
    m: ['SIC/XE', 'SIC/XE'] as Two,
    p: ['A small computer made for teaching, from Leland Beck\'s book System Software. Take the lid off and there are five things inside.',
      'حاسوب صغير صُمّم للتعليم، من كتاب `System Software` لمؤلفه Leland Beck. ارفع الغطاء فتجد في داخله خمسة أشياء.'] as Two,
    parts: {
      regs: [['Registers', 'A, X, L, B, S, T, PC and SW, 24 bits each'], ['السجلات', '`A` و`X` و`L` و`B` و`S` و`T` و`PC` و`SW`، كل واحد 24 بتًا']],
      cu: [['Control unit', 'Reads one instruction, then carries it out'], ['وحدة التحكم', 'تقرأ تعليمة واحدة ثم تنفّذها']],
      alu: [['ALU', 'Adds, subtracts and compares'], ['وحدة الحساب والمنطق', 'تجمع وتطرح وتقارن']],
      mem: [['Memory', '1 MB of bytes, each with an address'], ['الذاكرة', '1 ميغابايت من البايتات، ولكل بايت عنوان']],
      bus: [['Bus', 'Carries addresses and data between them'], ['الناقل', 'ينقل العناوين والبيانات بين الأجزاء']],
    } as Record<string, [Two, Two]>,
  },
  bytes: {
    h: ['It only reads bytes.', 'هي لا تقرأ إلا البايتات.'] as Two,
    m: ['05 00 01', '05 00 01'] as Two,
    p: ['At address `0000` the machine finds three bytes. To the machine they say: put the number 1 in register X. To us they say nothing. So we write `LDX #1` and let a program translate it. That program is the assembler.',
      'عند العنوان `0000` تجد الآلة ثلاثة بايتات. معناها عند الآلة: ضع الرقم 1 في السجل `X`. أما نحن فلا نفهم منها شيئًا. لذلك نكتب `LDX #1` ونترك برنامجًا يترجمها. هذا البرنامج هو المجمّع.'] as Two,
    pin: ['addresses 0000 to 0002', 'العناوين من `0000` إلى `0002`'] as Two,
  },
  pass1: {
    h: ['First pass: only measure.', 'المرور الأول: قياس فقط.'] as Two,
    m: ['LOCCTR', 'LOCCTR'] as Two,
    p: ['The assembler reads the program twice. The first time it writes no code. It gives each line an address and notes where every label lives.',
      'المجمّع يقرأ البرنامج مرتين. في المرة الأولى لا يكتب أي كود. يعطي كل سطر عنوانه، ويسجّل مكان كل `label`.'] as Two,
    empty: ['No labels yet', 'لا توجد labels بعد'] as Two,
  },
  pass2: {
    h: ['Second pass: write the bits.', 'المرور الثاني: كتابة البتات.'] as Two,
    intro: ['Every label has an address now, so each line can become bits. Take the first one. It is three bytes long: 24 empty bits to fill.',
      'صار لكل `label` عنوان، فيمكن الآن تحويل كل سطر إلى بتات. نبدأ بالسطر الأول. طوله ثلاثة بايتات، أي 24 بتًا فارغًا علينا ملؤها.'] as Two,
    done: ['Three bytes, ready for memory.', 'ثلاثة بايتات جاهزة للذاكرة.'] as Two,
    pick: ['Every line goes the same way. Try another one.', 'كل سطر يمر بالطريق نفسه. جرّب سطرًا آخر.'] as Two,
    open: ['Open this line in the lab', 'افتح هذا السطر في المحاكاة'] as Two,
    step: ['Step', 'الخطوة'] as Two,
  },
  addr: {
    h: ['An address has to fit', 'العنوان أكبر من الحقل.'] as Two,
    m: ['in 12 bits.', 'الحقل 12 بتًا فقط.'] as Two,
    beats: [
      ['So the assembler stores a distance instead: from PC, the address of the next instruction, to the target.', 'لذلك يخزّن المجمّع مسافة بدل العنوان: من `PC`، وهو عنوان التعليمة التالية، إلى الهدف.'],
      ['A jump backwards gives a negative distance.', 'القفز إلى الخلف يعطي مسافة سالبة.'],
      ['Too far from PC? Measure from register B. If that fails too, a `+` makes the instruction four bytes, with room for the whole address.', 'الهدف أبعد من مدى `PC`؟ نقيس من السجل `B`. وإن لم يكفِ ذلك أيضًا، فعلامة `+` تجعل التعليمة أربعة بايتات تتسع للعنوان كله.'],
    ] as Two[],
    pcReach: ['reach from PC', 'مدى `PC`'] as Two,
    bReach: ['reach from B', 'مدى `B`'] as Two,
    from: ['from Beck\'s COPY program', 'من برنامج `COPY` في كتاب Beck'] as Two,
  },
  formats: {
    h: ['Four sizes of instruction.', 'أربعة أحجام للتعليمة.'] as Two,
    m: ['1, 2, 3 or 4 bytes', '1 أو 2 أو 3 أو 4 بايتات'] as Two,
    p: ['`ADDR X,A` works on two registers and needs no address, so it is two bytes long. That is why Pass 1 moved LOCCTR by 2 for it and by 3 for the others.',
      '`ADDR X,A` تعمل على سجلّين ولا تحتاج عنوانًا، فطولها بايتان. ولهذا حرّك `Pass 1` الـ `LOCCTR` بمقدار 2 عندها، وبمقدار 3 عند غيرها.'] as Two,
    rows: [
      ['Format 1', 'the opcode alone'], ['Format 2', 'opcode and two registers'], ['Format 3', 'opcode, six flag bits and a 12-bit disp'], ['Format 4', 'the same, with a 20-bit address; written with +'],
    ] as Two[],
    rowsAr: [
      ['Format 1', 'الـ opcode وحده'], ['Format 2', 'الـ opcode وسجلّان'], ['Format 3', 'الـ opcode وستة بتات تحكم و disp من 12 بتًا'], ['Format 4', 'مثله لكن بعنوان من 20 بتًا، ويُكتب بعلامة +'],
    ] as Two[],
  },
  object: {
    h: ['The result is a file.', 'النتيجة ملف.'] as Two,
    m: ['H  T  E', 'H  T  E'] as Two,
    p: ['Pass 2 does the same for every line, then writes the bytes out as text records. This is the object program: what the assembler hands over.',
      'يكرر `Pass 2` العمل نفسه مع كل سطر، ثم يكتب البايتات في سجلات نصية. هذا هو الـ `object program`، وهو ما يسلّمه المجمّع.'] as Two,
    H: [['program name', 'اسم البرنامج'], ['start address', 'عنوان البداية'], ['length in bytes', 'الطول بالبايتات']] as Two[],
    Tr: [['load address', 'عنوان التحميل'], ['bytes in this record', 'عدد البايتات في السجل'], ['the code', 'الكود']] as Two[],
    E: [['address of the first instruction', 'عنوان أول تعليمة']] as Two[],
  },
  loader: {
    h: ['The loader copies it in.', 'الـ loader ينسخه إلى الذاكرة.'] as Two,
    m: ['PC = 0000', 'PC = 0000'] as Two,
    p: ['The loader reads the records, puts every byte at its address and points PC at the first instruction. The assembler\'s work is over.',
      'يقرأ الـ `loader` السجلات، ويضع كل بايت في عنوانه، ثم يوجّه `PC` إلى أول تعليمة. وهنا ينتهي عمل المجمّع.'] as Two,
  },
  run: {
    h: ['Now it runs.', 'والآن تعمل.'] as Two,
    p: ['Fetch, decode, execute. The control unit reads the bytes at PC, works out what they ask for, and does it. Then again.',
      'جلب، ثم فك، ثم تنفيذ. وحدة التحكم تقرأ البايتات عند `PC`، وتفهم المطلوب، وتنفّذه. ثم تعيد ذلك.'] as Two,
    step: ['Instruction', 'التعليمة'] as Two,
    legend: [['fetch', 'جلب'], ['execute', 'تنفيذ'], ['store', 'تخزين']] as Two[],
    end: ['The sum of 1 to 5 is now in memory, at RESULT.', 'مجموع الأعداد من 1 إلى 5 صار في الذاكرة عند `RESULT`.'] as Two,
  },
  outro: {
    h: ['Your turn.', 'دورك الآن.'] as Two,
    m: ['One step at a time.', 'خطوة بخطوة.'] as Two,
    p: ['The lab holds everything you just watched: the same program, one step at a time, and then any program you write.',
      'في المحاكاة كل ما شاهدته الآن: البرنامج نفسه خطوة بخطوة، ثم أي برنامج تكتبه أنت.'] as Two,
    open: ['Open the lab', 'افتح المحاكاة'] as Two,
    again: ['Back to the start', 'العودة إلى البداية'] as Two,
    note: ['Every number in this story was computed by the lab\'s own assembler and CPU.', 'كل رقم في هذا العرض حسبه مجمّع المحاكاة ومعالجها.'] as Two,
  },
};
