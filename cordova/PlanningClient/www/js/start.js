'use strict';

//const vConsole = new VConsole();
//const remoteConsole = new RemoteConsole("http://[remote server]/logio-post");
//window.datgui = new dat.GUI();

const default_latlng = { lat: 35.45270998308742, lng: 139.64288124427858 };
const MAX_IMAGE_WIDTH = 500;
const MAX_IMAGE_HEIGHT = 500;
const base_url = "https://【立ち上げたサーバのURL】";

let isDeviceReady = false;
let isMapLibReady = false;
let map;
let marker;
let infoWindow;
let polyline;
let geocoder;
let places;
let pointMarker_list = [];
let pointInfowin_list = [];

function initMap() {
    vue.onMapLibLoaded();
}

var vue_options = {
    el: "#top",
    mixins: [mixins_bootstrap],
    store: vue_store,
    router: vue_router,
    data: {
        notCordova: false,
        userId: "",
        uploadUrl: "",
        dbsize: 0,
        data_setting: {
            minTime: 60 * 1000,
            minDistance: 50.0,
            uploadDuration: 3 * 60 * 1000
        },
        center_trace: true,
        isRunning: false,
        isBootup: false,
        isPolylineTrace: false,
        data_point_append: {},
        travelmode: 'walking',
        googlemap_index: 0,

        memo_selecting_index: -1,
        target_point_index: 0,
        target_image_index: 0,
        target_point: {},
        target_images: [],

        route_id: "",
        route_name: "",
        point_list: [],
        start_datatime: 0,
        end_datatime: 0,
        memo_list: [],

        route_list: [],
        selecting_route: {},
        inPointAdding: false,
        newIntent: null,

        data_period_edit: {},
        from_point_index: -1,
        data_draw_trajectory: {
            type: "none",
            start_datetime: new Date().getTime(),
            end_datetime: new Date().getTime(),
        },
    },
    computed: {
    },
    methods: {
        image_url: function (point_index, image_index) {
            var item = this.point_list[point_index]?.images[image_index];
            if (!item)
                return null;
            if (item.url.startsWith("http://") || item.url.startsWith("https://"))
                return item.url;
            else
                return base_url + item.url;
        },
        reload: function () {
            location.reload();
        },
        onDeviceReady: async function (notCordova) {
            console.log("onDeviceReady(" + notCordova + ") called");

            this.notCordova = notCordova;

            if( !this.notCordova ){
                var result = await check_permission();
                if (!result)
                    await request_permission();

                var result = await locationrecorderplugin.isRunning();
                console.log("isRunning: " + result.running);
                this.isRunning = result.running;
                var result = await locationrecorderplugin.getBootup();
                console.log("getBootup: " + result.enable);
                this.isBootup = result.enable;
                var result = await locationrecorderplugin.getUserId();
                console.log("getUserId: " + result.userId);
                this.userId = result.userId;
                var result = await locationrecorderplugin.getDatabaseSize();
                console.log("getDatabaseSize: " + result.size);
                this.dbsize = result.size;
                var result = await locationrecorderplugin.getUploadUrl();
                this.uploadUrl = result.url;

                await locationrecorderplugin.setCallback(true, this.onCallback);
                window.plugins.intent.setNewIntentHandler(this.onNewIntent);
            }

            isDeviceReady = true;
            if (isMapLibReady && isDeviceReady)
                this.map_initialize();

        },
        onMapLibLoaded: async function () {
            console.log("onMapLibLoaded");

            isMapLibReady = true;
            if (isMapLibReady && isDeviceReady)
                this.map_initialize();
        },

        map_initialize: async function () {
            map = new google.maps.Map(document.getElementById('map'), {
                mapId: "7df2d623fc505470", // マップID
                zoom: 15, // ズームレベル
                center: default_latlng, // 地図の中心点,
                draggableCursor: "pointer"
            });
            places = new google.maps.places.PlacesService(map);
            geocoder = new google.maps.Geocoder();
            infoWindow = new google.maps.InfoWindow({ content: "" });
            marker = new google.maps.Marker({
                map: map,
                position: default_latlng,
                icon: {
                    url: "https://maps.google.com/mapfiles/kml/paddle/go.png",
                    scaledSize: new google.maps.Size(40, 40),
                }
            });
            await this.map_currentPosition();
        },
        onCallback: function (e) {
            console.log("onCallback:", e);
            if (e.type == "updatelocation") {
                var latlng = new google.maps.LatLng(e.location.lat, e.location.lng);
                marker.setPosition(latlng);
                if (polyline && isPolylineTrace) {
                    var path = polyline.getPath();
                    path.push(latlng);
                }
                if (this.center_trace) {
                    map.setCenter(latlng);
                }
            }
        },
        onNewIntent: async function(intent){
            console.log("onNewIntent:", intent);
            if( !intent.extras || !intent.extras["android.intent.extra.TEXT"])
                return;
            if (this.inPointAdding || this.newIntent) {
                this.toast_show("他のポイントを追加中です。");
                return;
            }
            if( !this.route_name ){
                this.newIntent = intent;
                this.start_route_select();
            }else{
                if( intent.extras["androidx.core.app.EXTRA_CALLING_PACKAGE"] == "com.google.android.apps.maps" ){
                    this.start_point_append(intent.extras["android.intent.extra.TEXT"]);
                }else{
                    var now = new Date().getTime();
                    var item = {
                        title: intent.extras["android.intent.extra.TITLE"] || this.toLocaleString(now),
                        text: intent.extras["android.intent.extra.TEXT"],
                        datetime: now
                    };
                    this.memo_list.push(item);
                    try {
                        this.progress_open();
                        await this.route_update();
                        this.toast_show("メモを追加しました。");
                    } catch (error) {
                        console.error(error);
                        alert(error);
                    } finally {
                        this.progress_close();
                    }
                }
            }
        },

        start_view_image: async function (point_index, image_index) {
            this.target_point_index = point_index;
            this.target_image_index = image_index;
            this.target_images = this.point_list[point_index].images;
            this.dialog_open("#point_image_dialog");
        },

        // 現在地の更新ボタン
        map_currentPosition: function () {
            navigator.geolocation.getCurrentPosition((position) => {
                var latlng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
                marker.setPosition(latlng);
                map.setCenter(latlng);
            }, (error) => {
                console.error(error);
            }, { timeout: 30000 });
        },

        // ルート選択ボタン
        start_route_select: async function () {
            try{
            var input = {
                url: base_url + "/planning-list",
                body: {}
            };
            var result = await do_http(input);
            console.log(result);

            this.route_list = result.list;
            this.dialog_open("#route_select_dialog");
            }catch(error){
                console.error(error);
                alert(error);
                this.newIntent = null;
            }
        },

        // ルート削除ボタン
        start_route_delete: async function () {
            if (!confirm("本当に削除しますか？"))
                return;

            try{
            var input = {
                url: base_url + "/planning-delete",
                body: {
                        userid: this.userId,
                    route_id: this.route_id
                }
            };
            var result = await do_http(input);
            console.log(result);

            this.route_id = "";
            this.route_name = "";
            this.point_list = [];
            this.update_point_marker();
            }catch(error){
                console.error(error);
                alert(error);
            }
        },

        // ルート作成ボタン
        start_route_create: async function () {
            var name = prompt("ルート名を入力してください。");
            if (!name)
                return;

            try{
                var input = {
                    url: base_url + "/planning-create",
                    body: {
                        content: {
                            userid: this.userId,
                            name: name,
                            point_list: [],
                            memo_list: [],
                            start_datetime: 0,
                            end_datetime: 0,
                        }
                    }
            };
            var result = await do_http(input);
            console.log(result);

            this.route_id = result.id;
            this.route_name = name;
            this.point_list = [];
            this.memo_list = [];
            this.start_datetime = 0;
            this.end_datetime = 0;
            this.update_point_marker();
            }catch(error){
                console.error(error);
                alert(error);
            }
        },

        // ルート名の変更ボタン
        edit_route_name: async function () {
            var name = prompt("ルート名を入力してください。", this.route_name);
            if (!name)
                return;

            this.route_name = name;
            try {
                this.progress_open();
                await this.route_update();
            } catch (error) {
                console.error(error);
            } finally {
                this.progress_close();
            }
        },

        route_update: async function () {
            var body = {
                route_id: this.route_id,
                content: {
                    userid: this.userId,
                    name: this.route_name,
                    memo_list: this.memo_list,
                    start_datetime: this.start_datetime,
                    end_datetime: this.end_datetime,
                    point_list: this.point_list.map(item => ({
                        name: item.name,
                        lat: item.lat,
                        lng: item.lng,
                        place_id: item.place_id,
                        memo: item.memo,
                        url: item.url,
                        images: item.images
                    })),
                }
            };
            var input = {
                url: base_url + "/planning-update",
                body: body
            };
            var result = await do_http(input);
            console.log(result);
        },

        // ポイントの操作
        point_delete: async function (index) {
            if (!confirm("本当に削除しますか？"))
                return;

            this.point_list.splice(index, 1);
            this.update_point_marker();
            try {
                this.progress_open();
                await this.route_update();
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },
        point_forward: async function (index) {
            if (index <= 0)
                return;
            var item = this.point_list.splice(index, 1);
            this.point_list.splice(index - 1, 0, item[0]);
            this.update_point_marker();
            this.$nextTick(() => {
                this.point_panel_open(index - 1);
            });

            try {
                this.progress_open();
                await this.route_update();
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },
        point_backward: async function (index) {
            if (index >= this.point_list.length - 1)
                return;
            var item = this.point_list.splice(index, 1);
            this.point_list.splice(index + 1, 0, item[0]);
            this.update_point_marker();
            this.$nextTick(() => {
                this.point_panel_open(index + 1);
            });

            try {
                this.progress_open();
                await this.route_update();
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },
        point_panel_open: function (index) {
            for (var i = 0; i < this.point_list.length; i++) {
                if (i == index)
                    this.panel_open("#" + 'point_entry_' + i);
                else
                    this.panel_close("#" + 'point_entry_' + i);
            }
        },
        update_point_marker: function () {
            for (let item of pointMarker_list)
                item.setMap(null);
            pointMarker_list = [];
            for (var i = 0; i < this.point_list.length; i++) {
                var point = this.point_list[i];
                let position = new google.maps.LatLng(point.lat, point.lng);
                let marker = new google.maps.Marker({
                    map: map,
                    position: position,
                    label: {
                        text: String(i + 1)
                    }
                });

                let content = `${i + 1}<br><a class="btn btn-default" href='https://www.google.com/search?hl=ja&q=${encodeURIComponent(point.name)}'>${point.name}</a></div>`;
                marker.addListener('click', () => {
                    let _content = content;
                    let _position = position;
                    let _marker = marker;
                    infoWindow.setContent(_content);
                    infoWindow.setPosition(_position);
                    infoWindow.open(map, _marker);
                });
                pointMarker_list.push(marker);
            }
        },

        // ルート選択ダイアログ
        do_route_select_cancel: function(){
            this.dialog_close('#route_select_dialog');
            this.newIntent = null;
        },
        do_route_select_read: async function () {
            try{
                var input = {
                    url: base_url + "/planning/" + this.selecting_route.id + "/content.json",
                    method: "GET",
                };
                var result = await do_http(input);
                console.log(result);

                this.route_id = this.selecting_route.id;
                this.route_name = result.name;
                this.point_list = result.point_list;
                this.memo_list = result.memo_list || [];
                this.memo_selecting_index = -1;
                this.start_datetime = result.start_datetime;
                this.end_datetime = result.end_datetime;

                this.update_point_marker();
                if( !this.notCordova && this.start_datetime && this.end_datetime )
                    await this.start_trajectory(this.start_datetime, this.end_datetime, false);

                this.dialog_close("#route_select_dialog");
                if( this.newIntent ){
                    var intent = this.newIntent;
                    this.newIntent = null;
                    if( intent.extras["androidx.core.app.EXTRA_CALLING_PACKAGE"] == "com.google.android.apps.maps" ){
                        this.start_point_append(intent.extras["android.intent.extra.TEXT"]);
                    }else{
                        var now = new Date().getTime();
                        var item = {
                            title: intent.extras["android.intent.extra.TITLE"] || this.toLocaleString(now),
                            text: intent.extras["android.intent.extra.TEXT"],
                            datetime: now
                        };
                        this.memo_list.push(item);
                        try {
                            this.progress_open();
                            await this.route_update();
                            this.toast_show("メモを追加しました。");
                        } catch (error) {
                            console.error(error);
                            alert(error);
                        } finally {
                            this.progress_close();
                        }
                    }
                }
            }catch(error){
                console.error(error);
                alert(error);
                this.newIntent = null;
            }
        },

        // 軌跡表示ダイアログ
        do_change_trajectory: async function () {
            if (this.data_draw_trajectory.type == "current"){
                await this.start_trajectory(this.data_draw_trajectory.start_datetime, new Date().getTime(), true);
            }else if (this.data_draw_trajectory.type == "history"){
                await this.start_trajectory(this.data_draw_trajectory.start_datetime, this.data_draw_trajectory.end_datetime, false);
            }else if(this.data_draw_trajectory.type == "none"){
                if (polyline) {
                    polyline.setMap(null);
                    polyline = null;
                    this.isPolylineTrace = false;
                }
            }

            this.dialog_close('#draw_trajectory_dialog');
        },

        start_trajectory: async function (start_datetime, end_datetime, trace) {
            if (polyline) {
                polyline.setMap(null);
                polyline = null;
                this.isPolylineTrace = false;
            }

            var path = [];
            var input = {
                url: base_url + "/planning-get-location",
                body: {
                    userid: this.userId,
                    start: start_datetime,
                    end: end_datetime
                }
            };
            var result = await do_http(input);
            console.log(result);
            for (const item of result) {
                path.push({ lat: item.lat, lng: item.lng });
            }

            var result = await locationrecorderplugin.getPastLocationList(start_datetime, end_datetime);
            console.log(result);
            for (const item of result.records) {
                path.push({ lat: item.lat, lng: item.lng });
            }

            polyline = new google.maps.Polyline({
                path: path,
                geodesic: true,
                strokeColor: "#FF8000",
                strokeOpacity: 0.8,
                strokewidght: 2
            });
            polyline.setMap(map);
            this.isPolylineTrace = trace;
        },

        // 設定ダイアログ
        uploadUrl_change: async function(){
            var url = prompt("アップロードURLを入力してください", this.uploadUrl );
            if( url == null )
                return;
            await locationrecorderplugin.setUploadUrl(url);
            this.uploadUrl = url;
            this.toast_show("アップロード先URLを変更しました。");
        },
        bootup_change: async function () {
            var result = await locationrecorderplugin.setBootup(this.isBootup);
            console.log(result);
        },
        start_service: async function () {
            var result = await locationrecorderplugin.startService(this.data_setting.minTime, this.data_setting.minDistance, this.data_setting.uploadDuration);
            console.log(result);
            this.isRunning = true;
            this.toast_show("位置情報の記録を開始しました。");
        },
        stop_service: async function () {
            var result = await locationrecorderplugin.stopService();
            console.log(result);
            this.isRunning = false;
            this.toast_show("位置情報の記録を停止しました。");
        },

        // ポイント追加ダイアログ
        start_point_append: async function (url) {
            if (!this.route_name) {
                alert("先にルートを作成してください。");
                return;
            }
            this.data_point_append = {
                url: url,
                position: "backward"
            };
            if (url)
                await this.parse_share_url();
            this.inPointAdding = true;
            this.dialog_open("#point_append_dialog");
        },
        cancel_point_append: function () {
            this.dialog_close("#point_append_dialog");
            this.inPointAdding = false;
        },
        parse_share_url: async function () {
            var result = await retrieveDetailData(this.data_point_append.url);
            console.log(result);
            this.$set(this.data_point_append, "result", {
                name: result.name,
                lat: result.geometry.location.lat(),
                lng: result.geometry.location.lng(),
                place_id: result.place_id,
                url: result.website,
                images: [],
            });
        },
        do_point_append: async function () {
            var item = this.data_point_append.result;
            if (this.data_point_append.type == 'foot') {
                this.point_list.push(item);
                this.data_point_append.index = this.point_list.length - 1;
            } else if (this.data_point_append.type == 'head') {
                this.point_list.unshift(item);
                this.data_point_append.index = 0;
            }else if (this.data_point_append.type == 'index') {
                if (this.data_point_append.position == 'forward') {
                    this.point_list.splice(this.data_point_append.index, 0, item);
                } else {
                    this.data_point_append.index++;
                    this.point_list.splice(this.data_point_append.index, 0, item);
                }
            }else{
                return;
            }

            this.$nextTick(() => {
                this.point_panel_open(this.data_point_append.index);
            });

            this.update_point_marker();
            this.dialog_close("#point_append_dialog");
            this.inPointAdding = false;

            try {
                this.progress_open();
                await this.route_update();
            } catch (error) {
                console.error(error);
            } finally {
                this.progress_close();
            }
        },

        // アプリ表示ダイアログ
        do_goto_map: function (index) {
            map.setCenter(this.point_list[index]);
            location.href = "#map";
        },
        start_googlemap: async function (index) {
            this.googlemap_index = index;
            this.dialog_open("#googlemap_dialog");
        },
        do_google_search: async function () {
            var params = "&q=" + encodeURIComponent(this.point_list[this.googlemap_index].name);
            var href = 'https://www.google.com/search?hl=ja' + params;
            console.log(href);
            window.open(href, '_blank');
            this.dialog_close("#googlemap_dialog");
        },
        do_googlemap_search: async function () {
            var params = "&query=" + encodeURIComponent(this.point_list[this.googlemap_index].lat + "," + this.point_list[this.googlemap_index].lng);
            if (this.point_list[this.googlemap_index].place_id)
                params += "&query_place_id=" + this.point_list[this.googlemap_index].place_id;
            var href = 'https://www.google.com/maps/search/?api=1' + params;
            console.log(href);
            window.open(href, '_blank');
            this.dialog_close("#googlemap_dialog");
        },
        do_googlemap_route: async function () {
            try {
                var origin;
                if (this.from_point_index < 0) {
                    this.progress_open("現在地取得中です。");
                    var position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(position => resolve(position), error => reject(error), { timeout: 300000 });
                    });
                    origin = { lat: position.coords.latitude, lng: position.coords.longitude };
                } else {
                    this.progress_open();
                    origin = { lat: this.point_list[this.from_point_index].lat, lng: this.point_list[this.from_point_index].lng };
                }
                var destination = this.point_list[this.googlemap_index];
                var params = "&travelmode=" + this.travelmode;
                params += "&origin=" + encodeURIComponent(origin.lat + ',' + origin.lng);
                params += "&destination=" + encodeURIComponent(destination.lat + ',' + destination.lng);
                if (destination.place_id)
                    params += "&destination_place_id=" + destination.place_id;
                var href = 'https://www.google.com/maps/dir/?api=1' + params;
                console.log(href);
                window.open(href, '_blank');
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
            this.dialog_close("#googlemap_dialog");
        },

        // ポイント編集ダイアログ
        start_point_update: async function (index) {
            this.target_point_index = index;
            this.target_point = {
                name: this.point_list[index].name,
                memo: this.point_list[index].memo,
                url: this.point_list[index].url
            };
            this.dialog_open("#point_update_dialog");
        },
        do_point_update: async function () {
            this.dialog_close("#point_update_dialog");
            this.point_list[this.target_point_index].name = this.target_point.name;
            this.point_list[this.target_point_index].memo = this.target_point.memo;
            this.point_list[this.target_point_index].url = this.target_point.url;

            try {
                this.progress_open();
                await this.route_update();
                this.data_point_append = {};
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },
        do_image_upload: async function(dataurl){
            try {
                this.progress_open();
                var input = {
                    url: base_url + "/planning-image-upload",
                    body: {
                    route_id: this.route_id,
                    image: dataurl
                    }
                };
                var result = await do_http(input);
                console.log(result);

                var item = {
                    id: result.id,
                    url: result.fname
                };
                this.point_list[this.target_point_index].images.push(item);
                await this.route_update();
                this.data_point_append = {};
                this.toast_show("画像が追加されました。");
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },
        start_camera_take: async function () {
            var result = await new Promise((resolve, reject) => {
                var option = {
                    quality: 80,
                    targetWidth: MAX_IMAGE_WIDTH,
                    targetHeight: MAX_IMAGE_HEIGHT,
                    saveToPhotoAlbum: true,
                    mediaType: Camera.MediaType.PICTURE,
                    destinationType: Camera.DestinationType.DATA_URL,
                    encodingType: Camera.EncodingType.JPEG,
                    correctOrientation: true,
                };
                navigator.camera.getPicture(resolve, reject, option);
            });
//            var dataurl = await resize_image2("data:image/jpeg;base64," + result, MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT);
//            await this.do_image_upload(dataurl);
            await this.do_image_upload("data:image/jpeg;base64," + result);
        },
        change_image_file: async function (files) {
            console.log(files);
            if (files.length <= 0)
                return;

            var dataurl = await resize_image(files[0], MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT);
            await this.do_image_upload(dataurl);
        },

        // 画像表示ダイアログ
        do_image_top: async function () {
            this.dialog_close("#point_image_dialog");

            var item = this.target_images.splice(this.target_image_index, 1);
            this.target_images.unshift(item[0]);
            this.data_point_append = {};

            try {
                this.progress_open();
                await this.route_update();
                this.toast_show("画像を先頭に移動しました。");
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },
        do_image_delete: async function () {
            if (!confirm("本当に削除しますか？"))
                return;

            this.dialog_close("#point_image_dialog");
            var item = this.target_images.splice(this.target_image_index, 1);
            this.data_point_append = {};

            try {
                this.progress_open();
                await this.route_update();

                if (item[0].id) {
                    var input = {
                        url: base_url + "/planning-image-delete",
                        body: {
                            route_id: this.route_id,
                            image_id: item[0].id
                        }
                    };
                    var result = await do_http(input);
                    console.log(result);
                }
                this.toast_show("画像を削除しました。");
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },

        // メモ表示ダイアログ
        memo_delete: async function(){
            if( !confirm("本当に削除しますか？"))
                return;

            this.memo_list.splice(this.memo_selecting_index, 1);
            this.memo_selecting_index = -1;
            try {
                this.progress_open();
                await this.route_update();
                this.toast_show("メモを削除しました。");
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },

        start_edit_route_pediod: function(){
            this.data_period_edit = {
                start_datetime: this.start_datetime,
                end_datetime: this.end_datetime,
            };
            this.dialog_open("#period_edit_dialog");
        },
        do_route_period_edit: async function(){
            if( !this.data_period_edit.start_datetime || !this.data_period_edit.end_datetime ||
                this.data_period_edit.start_datetime > this.data_period_edit.end_datetime ){
                alert("指定した時間が不正です。");
                return;
            }

            this.start_datetime = this.data_period_edit.start_datetime;
            this.end_datetime = this.data_period_edit.end_datetime;
            await this.start_trajectory(this.start_datetime, this.end_datetime, false);
            this.dialog_close("#period_edit_dialog");

            try {
                this.progress_open();
                await this.route_update();
                this.toast_show("期間を更新しました。");
            } catch (error) {
                console.error(error);
                alert(error);
            } finally {
                this.progress_close();
            }
        },
    },
    created: function () {
    },
    mounted: function () {
        proc_load();

        const ua = new UAParser();
        console.log(ua.getBrowser(), ua.getDevice(), ua.getEngine(), ua.getOS());
        const browser = ua.getBrowser();
        if( browser && ( browser.name == 'Chrome WebView' || browser.name == 'WebKit' )){
            const script = document.createElement("script");
            script.src = "cordova.js";
            document.head.appendChild(script);
        }else{
            vue.onDeviceReady(true);
        }
    }
};
vue_add_data(vue_options, { progress_title: '' }); // for progress-dialog
vue_add_global_components(components_bootstrap);
vue_add_global_components(components_utils);

/* add additional components */

window.vue = new Vue(vue_options);

async function request_permission() {
    var result = await new Promise((resolve, reject) => {
        cordova.plugins.diagnostic.requestLocationAuthorization(function (status) {
            console.log(status);
            resolve(status);
        }, function (error) {
            console.error(error);
            reject(error);
        },
            cordova.plugins.diagnostic.locationAuthorizationMode.WHEN_IN_USE,
            cordova.plugins.diagnostic.locationAccuracyAuthorization.FULL);
    });
    console.log(result);
}

async function check_permission() {
    var result_location = await new Promise((resolve, reject) => {
        cordova.plugins.diagnostic.getLocationAuthorizationStatuses(function (statuses) {
            console.log(statuses);
            resolve(statuses);
        }, function (error) {
            console.error(error);
            reject(error);
        });
    });

    if ((result_location.ACCESS_COARSE_LOCATION != "GRANTED") ||
        (result_location.ACCESS_FINE_LOCATION != "GRANTED")
    ) {
        return false;
    } else {
        return true;
    }
}

function extractPlaceData(url) {
    const namePattern = /\/maps\/place\/([^\/]+)\//;
    const coordinatePattern = /@([-+\d.]+),([-+\d.]+)/;

    const nameMatch = url.match(namePattern);
    const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : null;

    const coordinateMatch = url.match(coordinatePattern);
    const latitude = coordinateMatch ? parseFloat(coordinateMatch[1]) : null;
    const longitude = coordinateMatch ? parseFloat(coordinateMatch[2]) : null;

    return {
        name: name,
        lat: latitude,
        lng: longitude,
    };
}

function createBounds(center, radius) {
    const latPerMeter = 1 / 110574;
    const lngPerMeter = 1 / (111320 * Math.cos(center.lat() * Math.PI / 180));

    const latOffset = radius * latPerMeter;
    const lngOffset = radius * lngPerMeter;

    const northEast = new google.maps.LatLng(center.lat() + latOffset, center.lng() + lngOffset);
    const southWest = new google.maps.LatLng(center.lat() - latOffset, center.lng() - lngOffset);

    return new google.maps.LatLngBounds(southWest, northEast);
}

async function retrieveDetailData(url) {
    var input = {
        url: base_url + "/planning-parse-redirect",
        body: {
            url: url
        }

    };
    var result = await do_http(input);
    console.log(result);
    var result = extractPlaceData(result.location);
    console.log(result);

    var bounds = createBounds(new google.maps.LatLng(result.lat, result.lng), 100);
    return new Promise((resolve, reject) => {
        geocoder.geocode({ address: result.name, bounds: bounds }, (results, status) => {
            if (status === "OK") {
                places.getDetails({ placeId: results[0].place_id, fields: ["name", "geometry", "place_id", "website" }, (place, status) => {
                    if (status == "OK")
                        return resolve(place);
                    else
                        return reject(status);
                });
            } else {
                return reject(status);
            }
        });
    });
}

async function resize_image2(url, max_width, max_height) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            var x_ratio = image.width / max_width;
            var y_ratio = image.height / max_height;
            console.log(image.width, image.height, x_ratio, y_ratio);
            const ctx = canvas.getContext('2d');
            if (x_ratio <= 1.0 && y_ratio <= 1.0) {
                canvas.width = image.width;
                canvas.height = image.height;
                ctx.drawImage(image, 0, 0, image.width, image.height);
            } else if (x_ratio > y_ratio) {
                canvas.width = image.width / x_ratio;
                canvas.height = image.height / x_ratio;
                ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
            } else {
                canvas.width = image.width / y_ratio;
                canvas.height = image.height / y_ratio;
                ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
            }
            var dataurl = canvas.toDataURL('image/jpg');
            resolve(dataurl);
        };
        image.onerror = (error) => {
            reject(error);
        };
        image.src = url;
    });
}

async function resize_image(file, max_width, max_height) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                var x_ratio = image.width / max_width;
                var y_ratio = image.height / max_height;
                console.log(image.width, image.height, x_ratio, y_ratio);
                const ctx = canvas.getContext('2d');
                if (x_ratio <= 1.0 && y_ratio <= 1.0) {
                    canvas.width = image.width;
                    canvas.height = image.height;
                    ctx.drawImage(image, 0, 0, image.width, image.height);
                } else if (x_ratio > y_ratio) {
                    canvas.width = image.width / x_ratio;
                    canvas.height = image.height / x_ratio;
                    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
                } else {
                    canvas.width = image.width / y_ratio;
                    canvas.height = image.height / y_ratio;
                    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
                }
                var dataurl = canvas.toDataURL('image/jpg');
                resolve(dataurl);
            };
            image.onerror = (error) => {
                reject(error);
            };
            image.src = reader.result;
        };
        reader.onerror = (error) => {
            resolve(error);
        }
        reader.readAsDataURL(file);
    });
}
