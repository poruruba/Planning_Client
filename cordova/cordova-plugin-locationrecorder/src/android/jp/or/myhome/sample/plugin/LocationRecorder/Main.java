package jp.or.myhome.sample.plugin.LocationRecorder;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaWebView;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

public class Main extends CordovaPlugin {
    public static String TAG = "LocationRecorderPlugin.Main";
    private Activity activity;
    private CallbackContext callback;
    LocationService.LocationBinder binder;
    SharedPreferences pref;
    LocationDbHelper helper;
    SQLiteDatabase db;

    private BroadcastReceiver mReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "mReceiver.onReceive");

            Bundle bundle = intent.getExtras();
            String type = bundle.getString("type");
            if( type.equals("updatelocation") ) {
                long datetime = bundle.getLong("datetime");
                double lat = bundle.getDouble("lat");
                double lng = bundle.getDouble("lng");
                float speed = bundle.getFloat("speed");
                try {
                    JSONObject result = new JSONObject();
                    result.put("type", "updatelocation");
                    JSONObject location = new JSONObject();
                    location.put("lat", lat);
                    location.put("lng", lng);
                    location.put("speed", speed);
                    location.put("datetime", datetime);
                    result.put("location", location);
                    sendMessageToJs(result);
                }catch(Exception ex){
                    Log.d(TAG, ex.getMessage());
                }
            }else if( type.equals("lastupload") ){
                try {
                    long datetime = bundle.getLong("datetime");
                    JSONObject result = new JSONObject();
                    result.put("type", "lastupload");
                    result.put("datetime", datetime);
                    sendMessageToJs(result);
                }catch(Exception ex){
                    Log.d(TAG, ex.getMessage());
                }
            }
        }
    };

    public static class StartupReceiver extends BroadcastReceiver {
        public static final String TAG = Main.TAG;

        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "StartupReceiver.onReceive");

            SharedPreferences pref = context.getSharedPreferences("Private", context.MODE_PRIVATE);
            boolean autostart = pref.getBoolean("autostart", false);
            if( autostart ) {
                Intent i = new Intent(context, LocationService.class);
                context.startForegroundService(i);
            }
        }
    }

    @Override
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        Log.d(TAG, "[Plugin] initialize called");
        super.initialize(cordova, webView);

        activity = cordova.getActivity();
        pref = activity.getSharedPreferences("Private", Context.MODE_PRIVATE);
        helper = new LocationDbHelper(activity);
        db = helper.getWritableDatabase();

        IntentFilter intentFilter = new IntentFilter();
        intentFilter.addAction(LocationService.LocationUpdateAction);
        activity.registerReceiver(mReceiver, intentFilter);

        String userId = pref.getString("userId", null);
        if( userId == null ){
            UUID uuid = UUID.randomUUID();
            userId = uuid.toString();
            SharedPreferences.Editor editor = pref.edit();
            editor.putString("userId", userId);
            editor.apply();
        }

        ServiceConnection connection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName className, IBinder service) {
                Log.i(TAG, "onServiceConnected");
                binder = (LocationService.LocationBinder)service;
            }
            @Override
            public void onServiceDisconnected(ComponentName className) {
                Log.i(TAG, "onServiceDisconnected");
                binder = null;
            }
        };
    	Intent intent = new Intent(activity, LocationService.class);
        activity.bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

/*
    @Override
    public void onResume(boolean multitasking) {
        Log.d(TAG, "[Plugin] onResume called");
        super.onResume(multitasking);
    }

    @Override
    public void onPause(boolean multitasking) {
        Log.d(TAG, "[Plugin] onPause called");
        super.onPause(multitasking);
    }

    @Override
    public void onNewIntent(Intent intent) {
        Log.d(TAG, "[Plugin] onNewIntent called");
        super.onNewIntent(intent);
    }
*/

    void sendMessageToJs(JSONObject message) {
        if (callback != null) {
            final PluginResult result = new PluginResult(PluginResult.Status.OK, message);
            result.setKeepCallback(true);
            callback.sendPluginResult(result);
        }
    }

    @Override
    public boolean execute(String action, JSONArray args, final CallbackContext callbackContext) throws JSONException {
        Log.d(TAG, "[Plugin] execute " + action + " called");
    	
        if (action.equals("startService")) {
            try {
                int minTime = args.getInt(0);
                float minDistance = (float)args.getDouble(1);
                int uploadDuration = args.getInt(2);

                Intent intent = new Intent(activity, LocationService.class);
                intent.putExtra("minTime", minTime);
                intent.putExtra("minDistance", minDistance);
                intent.putExtra("uploadDuration", uploadDuration);
                activity.startForegroundService(intent);

                callbackContext.success("OK");
            }catch (Exception ex){
                callbackContext.error(ex.getMessage());
            }
        }else

        if (action.equals("stopService")){
            try{
                if( binder != null )
                    binder.stop();
            	
                Intent intent = new Intent(activity, LocationService.class);
                activity.stopService(intent);

                callbackContext.success("OK");
            }catch (Exception ex){
                callbackContext.error(ex.getMessage());
            }
        }else

        if (action.equals("isRunning")){
            try{
                if( binder == null )
                    throw new Exception("binder is null");

                boolean running = binder.isRunning();
                JSONObject result = new JSONObject();
                result.put("running", running);

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("setBootup")){
            try{
                boolean enable = args.getBoolean(0);
                SharedPreferences.Editor editor = pref.edit();
                editor.putBoolean("autostart", enable);
                editor.apply();

                callbackContext.success("OK");
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("getBootup")){
            try{
                boolean enable = pref.getBoolean("autostart", false);
                JSONObject result = new JSONObject();
                result.put("enable", enable);

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("getUploadUrl")){
            try{
                String uploadUrl = pref.getString("uploadUrl", "");
                JSONObject result = new JSONObject();
                result.put("url", uploadUrl);

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("setUploadUrl")){
            try{
                String uploadUrl = args.getString(0);
                SharedPreferences.Editor editor = pref.edit();
                editor.putString("uploadUrl", uploadUrl);
                editor.apply();

                callbackContext.success("OK");
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("getDatabaseSize")){
            try{
                if( binder == null )
                    throw new Exception("binder is null");

                long dbSize = binder.getDatabaseSize();
                JSONObject result = new JSONObject();
                result.put("size", dbSize);

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("getUserId")){
            try{
                if( binder == null )
                    throw new Exception("binder is null");

                String userId = binder.getUserId();
                JSONObject result = new JSONObject();
                result.put("userId", userId);

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("getRunningParams")){
            try{
                if( binder == null )
                    throw new Exception("binder is null");

                JSONObject result = new JSONObject();
                if( binder.isRunning() ) {
                    LocationService.RunningParams value = binder.getRunningParams();
                    JSONObject params = new JSONObject();
                    params.put("minTime", value.minTime);
                    params.put("minDistance", value.minDistance);
                    params.put("uploadDuration", value.uploadDuration);
                    result.put("params", params);
                }

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("getLastLocation")){
            try{
                if( binder == null )
                    throw new Exception("binder is null");

                LocationDbHelper.LocationItem item = binder.getLastLocation();
                JSONObject result = new JSONObject();
                if( item != null ) {
                    JSONObject location = new JSONObject();
                    location.put("lat", item.lat);
                    location.put("lng", item.lng);
                    location.put("speed", item.speed);
                    location.put("datetime", item.datetime);
                    result.put("location", location);
                }

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("getLocationList")){
            try{
                List<LocationDbHelper.LocationItem> locationList = helper.getLocationList(db);
                Iterator<LocationDbHelper.LocationItem> iterator = locationList.listIterator();
                JSONObject result = new JSONObject();
                JSONArray records = new JSONArray();
                while(iterator.hasNext()){
                    LocationDbHelper.LocationItem item = iterator.next();
                    JSONObject location = new JSONObject();
                    location.put("lat", item.lat);
                    location.put("lng", item.lng);
                    location.put("speed", item.speed);
                    location.put("datetime", item.datetime);
                    records.put(location);
                }
                result.put("records", records);

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("getPastLocationList")){
            try{
                long start_datetime = args.getLong(0);
                long end_datetime = args.getLong(1);

                List<LocationDbHelper.LocationItem> locationList = helper.getPastLocationList(db, start_datetime, end_datetime);
                Iterator<LocationDbHelper.LocationItem> iterator = locationList.listIterator();
                JSONObject result = new JSONObject();
                JSONArray records = new JSONArray();
                while(iterator.hasNext()){
                    LocationDbHelper.LocationItem item = iterator.next();
                    JSONObject location = new JSONObject();
                    location.put("lat", item.lat);
                    location.put("lng", item.lng);
                    location.put("speed", item.speed);
                    location.put("datetime", item.datetime);
                    records.put(location);
                }
                result.put("records", records);

                callbackContext.success(result);
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        if (action.equals("setCallback")) {
            if (args.length() < 1) {
                callbackContext.error("invalid params");
                return false;
            }

            try{
                boolean arg0 = args.getBoolean(0);
                if( arg0 ){
                    callback = callbackContext;
                }else{
                    callback = null;
                    callbackContext.success("OK");
                }
            }catch(Exception ex){
                callbackContext.error(ex.getMessage());
            }
        } else

        {
            String message = "Unknown action : (" + action + ") " + args.getString(0);
            Log.d(TAG, message);
            callbackContext.error(message);
            return false;
        }

        return true;
    }
}
