import titleWords from "../assets/title-words.json";

function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)] as T;
}

export function generateRandomTitle(): string {
  const { adjectives, nouns, locations } = titleWords;

  const adj = pickRandom(adjectives);
  const noun = pickRandom(nouns);
  const noun2 = pickRandom(nouns);
  const loc = pickRandom(locations);

  const patterns = [
    `The ${adj} ${noun}`,
    `${noun} of the ${loc}`,
    `The ${adj} ${noun}: ${noun2} of the ${loc}`,
    `${adj} ${noun}s`,
    `A ${noun} of ${adj} ${noun2}s`,
    `${loc} of the ${adj} ${noun}`,
  ];

  return pickRandom(patterns);
}
