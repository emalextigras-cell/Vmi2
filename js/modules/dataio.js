/** Parse le texte CSV en lignes et cellules.
 * @param {string} text Contenu CSV.
 * @param {string|null} [delimiter] Séparateur explicite ou détection automatique.
 * @returns {string[][]} Lignes découpées.
 */
export function parseCsvRows(text, delimiter = null) {
  const source=String(text??'').replace(/^\uFEFF/,'');
  if(!delimiter){
    // Les exports VMI+ comportent plusieurs lignes de métadonnées avant
    // l'en-tête (4e ligne). Détecter sur plusieurs lignes évite qu'une
    // première ligne descriptive fausse le choix du séparateur.
    const sample=source.split(/\r?\n/).filter(line=>line.trim()).slice(0,12);
    const countOutsideQuotes=(line,separator)=>{
      let count=0,quoted=false;
      for(let i=0;i<line.length;i++){
        const char=line[i];
        if(char==='"'&&quoted&&line[i+1]==='"'){i++;continue}
        if(char==='"'){quoted=!quoted;continue}
        if(!quoted&&char===separator)count++;
      }
      return count;
    };
    const score=separator=>{
      const counts=sample.map(line=>countOutsideQuotes(line,separator));
      return Math.max(0,...counts)*100+counts.reduce((sum,value)=>sum+value,0);
    };
    delimiter=score(';')>score(',')?';':',';
  }
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(char==='"'&&source[i+1]==='"'){field+='"';i++}
      else if(char==='"')quoted=false;
      else field+=char;
    }else if(char==='"'&&field==='')quoted=true;
    else if(char===delimiter){row.push(field);field=''}
    else if(char==='\n'||char==='\r'){
      if(char==='\r'&&source[i+1]==='\n')i++;
      row.push(field);field='';rows.push(row);row=[];
    }else field+=char;
  }
  if(field!==''||row.length){row.push(field);rows.push(row)}
  return rows;
}
