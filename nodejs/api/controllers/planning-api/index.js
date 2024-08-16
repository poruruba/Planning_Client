'use strict';

const HELPER_BASE = process.env.HELPER_BASE || "/opt/";
const Response = require(HELPER_BASE + 'response');
const Redirect = require(HELPER_BASE + 'redirect');

const crypto = require('crypto');
const fs = require('fs').promises;

const dataurl = require('dataurl');
const mime = require("mime-types");
const mysql = require('mysql2/promise');

const PUBLIC_PLANNING_FOLDER = "/planning/";
const LOCAL_PLANNING_FOLDER = process.env.THIS_BASE_PATH + "/public" + PUBLIC_PLANNING_FOLDER;
const CONTENT_FNAME = "content.json";
const DB_HOST = "qnap.myhome.or.jp";
const DB_PORT = 3307;
const DB_USER = "test20240728";
const DB_PASSWORD = "ROOTER00";
const DB_DATABASE = "locationdb";

let conn;

async function db_connect(){
	if( conn != null ){
		try{
			await conn.query("SELECT 1");
			return conn;
		}catch(error){
			console.error(error);
		}
	}
	return mysql.createConnection({
		host: DB_HOST,
		port: DB_PORT,
		user: DB_USER,
		password: DB_PASSWORD,
		database: DB_DATABASE
	})
	.then(async (result) =>{
		conn = result;

		console.log("db start");
	});
};

function isValidUUID(uuid) {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

async function getFolders(directoryPath) {
	var files = await fs.readdir(directoryPath, { withFileTypes: true } );
	const folders = files
			.filter(file => file.isDirectory())  // フォルダのみフィルタリング
			.map(file => file.name);  // フォルダ名を取得
	return folders;
}

exports.handler = async (event, context, callback) => {
	var body = JSON.parse(event.body);
	console.log(body);

	if( event.path == '/planning-parse-redirect') {
		var response = await fetch( body.url, {redirect: "manual" });
		if( response.status == 301 || response.status == 302 ){
			var url = new URL(response.headers.get('location'), response.url);
			return new Response({ location: url.toString(), status: response.status });
		}else{
			throw new Error("not redirect");
		}
	}else

	if( event.path == '/planning-add-location'){
		await db_connect();
		
		for( const item of body){
			console.log(item);
			var userid = item.values.userid ? item.values.userid : "";
			var value = [item.values.lat, item.values.lng, "POINT(" + item.values.lat + " " + item.values.lng + ")", item.values.speed, item.values.datetime, userid];
			var sql = "INSERT INTO location (lat, lng, location, speed, datetime, userid) VALUES(?, ?, ST_GeomFromText(?, 4326), ?, ?, ?)";
			var result = await conn.execute(sql, value);
			console.log(result);
		}

		return new Response({});
	}else

	if( event.path == '/planning-get-location'){
		await db_connect();

//		var values = [body.start, body.end, body.userid];
//		var [rows, fields] = await conn.query("SELECT lat, lng, speed, datetime FROM location WHERE datetime >= ? AND datetime < ? ORDER BY AND userid = ? datetime ASC", values);
		var values = [body.start, body.end];
		var [rows, fields] = await conn.query("SELECT lat, lng, speed, datetime FROM location WHERE datetime >= ? AND datetime < ? ORDER BY datetime ASC", values);
		console.log(rows, fields);

		return new Response(rows);
	}else

	if( event.path == '/planning-image-upload'){
		var route_id = body.route_id;
		var image = body.image;

		if( !isValidUUID(route_id) )
			throw new Error("invalid route_id");

		var info = dataurl.parse(image);
		if( !info )
			throw new Error("invalid image");
		console.log(info);
		var ext = mime.extension(info.mimetype);
		var image_id = crypto.randomUUID();
		var fname = image_id + "." + ext;
		await fs.writeFile(LOCAL_PLANNING_FOLDER + route_id + "/" + fname, info.data);

		return new Response({ id: image_id, fname: PUBLIC_PLANNING_FOLDER + route_id + "/" + fname });		
	}else

	if( event.path == '/planning-image-delete'){
		var route_id = body.route_id;
		var image_id = body.image_id;

		if( !isValidUUID(route_id) || !isValidUUID(image_id) )
			throw new Error("invalid id");

		var list = await fs.readdir(LOCAL_PLANNING_FOLDER + route_id);
		for( let item of list){
			if( item.startsWith(image_id) )
				await fs.rm(LOCAL_PLANNING_FOLDER + route_id + "/" + item);
		}

		return new Response({})
	}else

	if( event.path == '/planning-create'){
		var content = body.content;

		var route_id = crypto.randomUUID();
		await fs.mkdir(LOCAL_PLANNING_FOLDER + route_id);
		await fs.writeFile(LOCAL_PLANNING_FOLDER + route_id + "/" + CONTENT_FNAME, JSON.stringify(content));

		return new Response({ url: PUBLIC_PLANNING_FOLDER + route_id + "/" + CONTENT_FNAME, id: route_id });
	}else

	if( event.path == '/planning-list'){
		var folders = await getFolders(LOCAL_PLANNING_FOLDER);
		console.log(folders);

		var list = [];
		for( let item of folders){
			try{
				var content = await fs.readFile(LOCAL_PLANNING_FOLDER + item + "/" + CONTENT_FNAME, { encoding: "utf8" });
				list.push({ id: item, name: JSON.parse(content).name });
			}catch(error){
				console.error(error);
			}
		}

		return new Response({ list: list, base: PUBLIC_PLANNING_FOLDER, content: CONTENT_FNAME });
	}else

	if( event.path == '/planning-update'){
		var route_id = body.route_id;
		var content = body.content;

		if( !isValidUUID(route_id) )
			throw new Error("invalid route_id");

		await fs.writeFile(LOCAL_PLANNING_FOLDER + route_id + "/" + CONTENT_FNAME, JSON.stringify(content, null , "\t"));

		return new Response({});
	}else

	if( event.path == '/planning-delete'){
		var route_id = body.route_id;
		await fs.rmdir(LOCAL_PLANNING_FOLDER + route_id, { recursive: true});

		return new Response({});
	}else

	{
		throw new Error("unknown endpoint");
	}
};
