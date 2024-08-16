package jp.or.myhome.sample.plugin.LocationRecorder;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.sqlite.SQLiteDatabase;
import android.location.Location;
import android.os.Binder;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import android.Manifest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.Priority;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.Iterator;
import java.util.List;

public class LocationService extends Service{
    public static final String TAG = Main.TAG;
    Context context;
    NotificationManager notificationManager;
    SharedPreferences pref;
    FusedLocationProviderClient fusedLocationClient;
    LocationCallback locationCallback;

    public static final String LocationUpdateAction = "LocationUpdateAction";
    public static final int DefaultMinTime = 60 * 1000; // msec
    public static final float DefaultMinDistance = 100.0f; // meter
    public static final int DefaultUploadDuration = 3 * 60 * 1000; // msec

    static final String CHANNEL_ID = "default";
    static final String NOTIFICATION_NAME = "位置情報の記録状態";
    static final String NOTIFICATION_TITLE_PROGRESS = "位置情報の記録中";
    static final String NOTIFICATION_TITLE_STOPPED = "位置情報の停止中";
    static final int NOTIFICATION_ID = 1;
    static final int DEFAULT_TIMEOUT = 10000;
	
    LocationDbHelper helper;
    SQLiteDatabase db;
    String userId;
    int uploadDuration = DefaultUploadDuration;
    int minTime = DefaultMinTime;
    float minDistance = DefaultMinDistance;
    long lastUploadDatetime = 0;
    boolean uploading = false;
    boolean isRunning = false;
    private LocationBinder binder = new LocationBinder();
    LocationDbHelper.LocationItem lastLocation = null;

    public static class RunningParams{
        public int minTime;
        public float minDistance;
        public int uploadDuration;

        public RunningParams(int minTime, float minDistance, int uploadDuration){
            this.minTime = minTime;
            this.minDistance = minDistance;
            this.uploadDuration = uploadDuration;
        }
    }

    public class LocationBinder extends Binder {
        public long getDatabaseSize(){
            File dbFile = new File(getDatabasePath(LocationDbHelper.DATABASE_NAME).getPath());
            return dbFile.length();
        }

        public String getUserId(){
            return userId;
        }
        public long getLastUploadDatetime() {
            return lastUploadDatetime;
        }
        public void stop(){
            Log.d(TAG, "stop called");
            if( locationCallback != null ) {
                fusedLocationClient.removeLocationUpdates(locationCallback);
                locationCallback = null;
                updateNotification(NOTIFICATION_TITLE_STOPPED);
            }
        }
        public LocationService getService(){
            return LocationService.this;
        }
        public boolean isRunning(){
            return isRunning && locationCallback != null;
        }
        public RunningParams getRunningParams(){
            return new RunningParams(minTime, minDistance, uploadDuration);
        }
        public LocationDbHelper.LocationItem getLastLocation(){
            return lastLocation;
        }
    }

    @Override
    public void onCreate() {
        Log.d(TAG, "onCreate called");
        super.onCreate();

        context = getApplicationContext();
        helper = new LocationDbHelper(this);
        db = helper.getWritableDatabase();
        pref = getSharedPreferences("Private", MODE_PRIVATE);
        userId = pref.getString("userId", null);

        notificationManager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if( notificationManager == null ) {
            Log.d(TAG, "NotificationManager not available");
            return;
        }
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, NOTIFICATION_NAME , NotificationManager.IMPORTANCE_DEFAULT);
        notificationManager.createNotificationChannel(channel);

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        if( fusedLocationClient == null ) {
            Log.d(TAG, "fusedLocationClient not available");
            return;
        }
    }

    public void updateNotification(String title) {
        Log.d(TAG, "updateNotification called");
    	
    	try{
    		
//        Intent notifyIntent = new Intent(this, MainActivity.class);
        Class<?> c = Class.forName(getPackageName() + ".MainActivity");
        Intent notifyIntent = new Intent(this, c);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, notifyIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new Notification.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setSmallIcon(android.R.drawable.btn_star)
                .setAutoCancel(false)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setContentIntent(pendingIntent)
                .build();
        notificationManager.notify(NOTIFICATION_ID, notification);
    		
        }catch(Exception ex){
            Log.d(TAG, ex.getMessage());
    }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand");

        Bundle bundle = intent.getExtras();
        if( bundle != null ){
            minTime = bundle.getInt("minTime", DefaultMinTime);
            minDistance = bundle.getFloat("minDistance", DefaultMinDistance);
            uploadDuration = bundle.getInt("uploadDuration", DefaultUploadDuration);
        }

        try {

//            Intent notifyIntent = new Intent(this, MainActivity.class);
            Class<?> c = Class.forName(getPackageName() + ".MainActivity");
        Intent notifyIntent = new Intent(this, c);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, notifyIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new Notification.Builder(context, CHANNEL_ID)
                .setContentTitle(NOTIFICATION_TITLE_PROGRESS)
                .setSmallIcon(android.R.drawable.btn_star)
                .setAutoCancel(false)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setContentIntent(pendingIntent)
                .build();
        startForeground(NOTIFICATION_ID, notification);

        startGPS(minTime, minDistance);
        isRunning = true;

        }catch(Exception ex){
            Log.d(TAG, ex.getMessage());
        }

        return START_STICKY;
    }

    private void startGPS(int minTime, float minDistance) {
        Log.d(TAG, "startGPS called");
        if (fusedLocationClient != null) {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                    ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                return;

            if( locationCallback != null ) {
                fusedLocationClient.removeLocationUpdates(locationCallback);
                locationCallback = null;
            }

            LocationRequest locationRequest = new LocationRequest.Builder(minTime)
                    .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                    .setMinUpdateIntervalMillis(minTime)
                    .setMinUpdateDistanceMeters(minDistance)
                    .build();

            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback = new LocationCallback() {
                @Override
                public void onLocationResult(LocationResult locationResult) {
                    super.onLocationResult(locationResult);
                    Log.d(TAG, "onLocationResult");

                    Location location = locationResult.getLastLocation();
                    long currentTime = System.currentTimeMillis();
                    lastLocation = helper.insertLocation(db, currentTime, location.getLatitude(), location.getLongitude(), location.getSpeed());

                    Intent broadcastIntent = new Intent();
                    broadcastIntent.setAction(LocationUpdateAction);
                    broadcastIntent.putExtra("type", "updatelocation");
                    broadcastIntent.putExtra("datetime", lastLocation.datetime);
                    broadcastIntent.putExtra("lat", lastLocation.lat);
                    broadcastIntent.putExtra("lng", lastLocation.lng);
                    broadcastIntent.putExtra("speed", lastLocation.speed);
                    sendBroadcast(broadcastIntent);

                    if((currentTime - lastUploadDatetime ) >= uploadDuration )
                        uploadLocationList();
                }
            }, Looper.getMainLooper());
        }
    }

    private void uploadLocationList(){
        Log.d(TAG, "uploadLocationList called");
        if( uploading )
            return;
        uploading = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try{
                    String uploadUrl = pref.getString("uploadUrl", "");
                    if( uploadUrl == null || uploadUrl.equals("") )
                        return;
                    String userId = pref.getString("userId", "DummyUserId");
                    List<LocationDbHelper.LocationItem> locationList = helper.getLocationList(db);
                    Iterator<LocationDbHelper.LocationItem> iterator = locationList.listIterator();
                    JSONArray records = new JSONArray();
                    long lastDatetime = 0;
                    while(iterator.hasNext()){
                        LocationDbHelper.LocationItem item = iterator.next();
                        JSONObject values = new JSONObject();
                        values.put("lat", item.lat);
                        values.put("lng", item.lng);
                        values.put("speed", item.speed);
                        values.put("datetime", item.datetime);
                        values.put("userid", userId);
                        JSONObject record = new JSONObject();
                        record.put("ts", item.datetime);
                        record.put("values", values);
                        records.put(record);
                        lastDatetime = item.datetime;
                    }
                    if( records.length() > 0 ) {
                        HttpPostJson.doPost(uploadUrl + "/planning-add-location", records.toString(), DEFAULT_TIMEOUT);

                        helper.deleteLocationList(db, lastDatetime);
                        lastUploadDatetime = lastDatetime;

                        long lastUpload = System.currentTimeMillis();
                        Intent broadcastIntent = new Intent();
                        broadcastIntent.setAction(LocationUpdateAction);
                        broadcastIntent.putExtra("type", "lastupload");
                        broadcastIntent.putExtra("datetime", lastUpload);
                        sendBroadcast(broadcastIntent);

                        Log.d(TAG, "log uploaded");
                    }
                }catch(Exception ex){
                    Log.e(TAG, ex.getMessage());
                }finally {
                    uploading = false;
                }
            }
        }).start();
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "onDestroy");

        if( locationCallback != null ){
            fusedLocationClient.removeLocationUpdates(locationCallback);
            locationCallback = null;
        }

        isRunning = false;
        uploadLocationList();
    }

    @Override
    public IBinder onBind(Intent intent) {
        Log.d(TAG, "onBind");
        return binder;
    }

    @Override
    public boolean onUnbind(Intent intent) {
        Log.d(TAG, "onUnbind");
        return true;
    }
}
