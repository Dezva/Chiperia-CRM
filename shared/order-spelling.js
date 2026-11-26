// Correcciones ortográficas, nunca equivalencias entre productos o categorías.
// Solo se corrige hacia palabras presentes en el catálogo actual del servicio.
function oneEdit(a, b) {
 if (Math.abs(a.length - b.length) > 1) return false;
 let i = 0;
 while (i < a.length && a[i] === b[i]) i++;
 if (i === a.length) return b.length === a.length + 1;
 if (a.length === b.length) {
  return a.slice(i + 1) === b.slice(i + 1) ||
   (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
 }
 return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function distance(a,b){
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
 return row[b.length];
}

export function correctOrderTokens(tokens, vocabulary, {semantic=false,fuzzy=false}={}) {
 const words = [...vocabulary].filter(word => word.length >= 4 && /^[a-z]+$/.test(word));
 return tokens.map(token => {
  // Un nombre o sinónimo confirmado siempre gana a cualquier semejanza.
  if (vocabulary.has(token) || !/^[a-z]+$/.test(token)) return token;
  // En palabras cortas una letra puede ser otro alimento: bollo/pollo, torta/tarta.
  if(semantic){
   // Candidatos ortográficos generales; solo se usan para validar una interpretación
   // del modelo, con otra palabra literal del artículo y sin ignorar texto sobrante.
   if(token.length<5)return token;
   const ranked=words.filter(word=>word.slice(0,3)===token.slice(0,3)).map(word=>({word,score:distance(token,word)/Math.max(token.length,word.length)})).filter(candidate=>candidate.score<=.5).sort((a,b)=>a.score-b.score);
   return ranked.length&&(!ranked[1]||ranked[0].score<ranked[1].score)?ranked[0].word:token;
  }
  if (token.length < (fuzzy?5:6)) return token;
  const candidates = token.length>=6?words.filter(word => oneEdit(token, word)):[];
  if(!candidates.length&&fuzzy){
   // Errores en nombres largos y abreviaciones con raíz compartida. El matcher
   // exige otra palabra literal del mismo artículo y descarta todos los empates.
   const ranked=words.map(word=>({word,edits:distance(token,word)})).filter(x=>{
    const score=x.edits/Math.max(token.length,x.word.length);
    return token.length>=7&&x.edits<=2&&score<=.28 ||
     x.word.length>=8&&x.word.length>=token.length+2&&x.word.slice(0,3)===token.slice(0,3)&&score<=.5;
   }).sort((a,b)=>a.edits-b.edits);
   if(ranked.length&&(!ranked[1]||ranked[0].edits<ranked[1].edits))return ranked[0].word;
  }
  // Dos candidatos cercanos requieren aclaración. No se elige por precio o disponibilidad.
  return candidates.length === 1 ? candidates[0] : token;
 });
}
