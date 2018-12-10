class Program{ 
	constructor(data){
		this.name = data.name;
		this.index = data.index;
	} 
};
Program.lib = [
	new Program({name:'Random',index:1}),
	new Program({name:'Rainbow',index:10}),
	new Program({name:'Twinkle',index:11}),
	new Program({name:'Red/Green',index:12}),
	new Program({name:'Rainbow Fade',index:13}),
	new Program({name:'Rainbow Split',index:14}),
	new Program({name:'Rainbow Static',index:15}),
	new Program({name:'Rainbow Spin',index:16}),
	new Program({name:'Rainbow Sparkles',index:17}),
];


Program.getByIndex = function( index ){
	for( let program of this.lib ){
		if( program.index === index )
			return program;
	}
	return Program.lib[0];
};


export default Program;