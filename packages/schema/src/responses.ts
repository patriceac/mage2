import type { ResponseGroup } from "./types";

export const STARTER_RESPONSE_LIBRARY_VERSION = 1;
export const STARTER_RESPONSE_LOCALES = ["en", "fr", "es", "zh-Hans", "ja", "ko", "ar"] as const;

type StarterResponseLocale = (typeof STARTER_RESPONSE_LOCALES)[number];
type StarterResponseGroupKey = "wrongItem" | "missingPrerequisite" | "alreadyCompleted" | "noEffect";

interface StarterResponseGroupDefinition {
  key: StarterResponseGroupKey;
  id: string;
  name: string;
}

const STARTER_RESPONSE_GROUP_DEFINITIONS: readonly StarterResponseGroupDefinition[] = [
  { key: "wrongItem", id: "response_group_wrong_item", name: "Wrong item" },
  { key: "missingPrerequisite", id: "response_group_missing_prerequisite", name: "Missing prerequisite" },
  { key: "alreadyCompleted", id: "response_group_already_completed", name: "Already completed" },
  { key: "noEffect", id: "response_group_no_effect", name: "No effect" }
];

const STARTER_RESPONSE_TRANSLATIONS: Record<
  StarterResponseLocale,
  Record<StarterResponseGroupKey, readonly [string, string, string, string]>
> = {
  en: {
    wrongItem: [
      "I can't use that here.",
      "That's not the right tool.",
      "That won't help.",
      "I need something else."
    ],
    missingPrerequisite: [
      "I'm missing something.",
      "I can't do that yet.",
      "I should deal with something else first.",
      "There's another step first."
    ],
    alreadyCompleted: [
      "That's already done.",
      "I've already handled that.",
      "There's nothing more to do here.",
      "I don't need to do that again."
    ],
    noEffect: [
      "Nothing happens.",
      "That had no effect.",
      "It doesn't react.",
      "That doesn't seem to change anything."
    ]
  },
  fr: {
    wrongItem: [
      "Je ne peux pas utiliser ça ici.",
      "Ce n'est pas le bon outil.",
      "Ça ne servira à rien.",
      "Il me faut autre chose."
    ],
    missingPrerequisite: [
      "Il me manque quelque chose.",
      "Je ne peux pas encore faire ça.",
      "Je dois d'abord m'occuper d'autre chose.",
      "Il faut d'abord passer par une autre étape."
    ],
    alreadyCompleted: [
      "C'est déjà fait.",
      "Je m'en suis déjà occupé.",
      "Il n'y a plus rien à faire ici.",
      "Inutile de recommencer."
    ],
    noEffect: [
      "Rien ne se passe.",
      "Ça n'a eu aucun effet.",
      "Il n'y a aucune réaction.",
      "Ça ne semble rien changer."
    ]
  },
  es: {
    wrongItem: [
      "No puedo usar eso aquí.",
      "Esa no es la herramienta adecuada.",
      "Eso no servirá.",
      "Necesito otra cosa."
    ],
    missingPrerequisite: [
      "Me falta algo.",
      "Aún no puedo hacer eso.",
      "Primero tengo que ocuparme de otra cosa.",
      "Antes hay que completar otro paso."
    ],
    alreadyCompleted: [
      "Eso ya está hecho.",
      "Ya me he ocupado de eso.",
      "Aquí no queda nada por hacer.",
      "No necesito hacerlo otra vez."
    ],
    noEffect: [
      "No pasa nada.",
      "Eso no ha tenido ningún efecto.",
      "No reacciona.",
      "Eso no parece cambiar nada."
    ]
  },
  "zh-Hans": {
    wrongItem: ["我不能在这里使用它。", "这不是合适的工具。", "这样没用。", "我需要别的东西。"],
    missingPrerequisite: ["我还缺点东西。", "我现在还不能这么做。", "我得先处理别的事。", "得先完成另一个步骤。"],
    alreadyCompleted: ["这已经完成了。", "我已经处理好了。", "这里没什么可做的了。", "我不需要再做一次。"],
    noEffect: ["什么也没发生。", "这没有任何效果。", "它毫无反应。", "这似乎没有改变任何东西。"]
  },
  ja: {
    wrongItem: ["ここでは使えない。", "これは適切な道具ではない。", "これでは役に立たない。", "別のものが必要だ。"],
    missingPrerequisite: ["何かが足りない。", "まだできない。", "先に別のことを済ませよう。", "その前にやることがある。"],
    alreadyCompleted: ["もう済んでいる。", "これはもう片づけた。", "ここでやることはもうない。", "もう一度やる必要はない。"],
    noEffect: ["何も起こらない。", "効果はなかった。", "反応がない。", "何も変わらないようだ。"]
  },
  ko: {
    wrongItem: ["여기서는 사용할 수 없다.", "이건 맞는 도구가 아니다.", "이걸로는 소용없다.", "다른 게 필요하다."],
    missingPrerequisite: ["뭔가 부족하다.", "아직은 할 수 없다.", "먼저 다른 일을 처리해야 한다.", "그 전에 해야 할 일이 있다."],
    alreadyCompleted: ["이미 끝난 일이다.", "이미 처리했다.", "여기서 더 할 일은 없다.", "다시 할 필요는 없다."],
    noEffect: ["아무 일도 일어나지 않는다.", "아무 효과가 없었다.", "반응이 없다.", "아무것도 바뀌지 않는 것 같다."]
  },
  ar: {
    wrongItem: ["لا يمكنني استخدام هذا هنا.", "هذه ليست الأداة المناسبة.", "لن يفيد ذلك.", "أحتاج إلى شيء آخر."],
    missingPrerequisite: ["ينقصني شيء ما.", "لا يمكنني فعل ذلك بعد.", "عليّ أن أنهي أمرًا آخر أولًا.", "هناك خطوة أخرى يجب إتمامها أولًا."],
    alreadyCompleted: ["لقد انتهى هذا بالفعل.", "لقد تولّيت هذا الأمر بالفعل.", "لم يعد هناك ما أفعله هنا.", "لا داعي لفعل ذلك مرة أخرى."],
    noEffect: ["لا يحدث شيء.", "لم يكن لذلك أي تأثير.", "لا توجد أي استجابة.", "لا يبدو أن ذلك يغيّر شيئًا."]
  }
};

export function getStarterResponseTextId(groupKey: StarterResponseGroupKey, index: number): string {
  const normalizedGroupKey = groupKey.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
  return `text.response.starter.${normalizedGroupKey}.${index + 1}`;
}

export function createStarterResponseGroups(): ResponseGroup[] {
  return STARTER_RESPONSE_GROUP_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    entries: STARTER_RESPONSE_TRANSLATIONS.en[definition.key].map((_, index) => ({
      id: `response_${definition.key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)}_${index + 1}`,
      kind: "text" as const,
      textId: getStarterResponseTextId(definition.key, index)
    }))
  }));
}

export function seedStarterResponseStrings(byLocale: Record<string, Record<string, string>>): void {
  for (const locale of STARTER_RESPONSE_LOCALES) {
    const targetStrings = (byLocale[locale] ??= {});
    for (const definition of STARTER_RESPONSE_GROUP_DEFINITIONS) {
      STARTER_RESPONSE_TRANSLATIONS[locale][definition.key].forEach((value, index) => {
        targetStrings[getStarterResponseTextId(definition.key, index)] ??= value;
      });
    }
  }
}
