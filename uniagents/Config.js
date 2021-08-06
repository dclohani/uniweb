var config = {
    development: {
        //url to be used in link generation
        url: 'http://my.site.com',
        //mongodb connection settings
        database: {
            host: '127.0.0.1',
            port: '27017',
            db: 'site_dev'
        },
        //server details
        ioserver: {
            host: '127.0.0.1',
            port: '3000'
        },
        timer: {
            client_health: 5000,
            chat_health: 30000,
            chat_inactive_interval: 3600000
        },
        dialogflow: {
            //project_id: 'tspldemo-aukrvm',
            //service_key_file: 'D:\\Projects\\Universal\\uniweb\\tspldemo-aukrvm-b8e34ba29483.json'
            project_id: 'test-mikvbb',
            service_key_file: 'D:\\deepak\\projects\\uniweb\\test-mikvbb-0afbbf58a015.json'
        },
        file_download_folder: 'D:\\Projects\\Universal\\UniManager-26Jan2020\\UniManager\\wwwroot\\downloads\\',
        kurento_url: 'ws://52.187.62.168:7888/kurento',
        video_recording_folder: '/tmp/'
    },
    production: {
        //url to be used in link generation
        url: 'http://my.site.com',
        //mongodb connection settings
        database: {
            host: '127.0.0.1',
            port: '27017',
            db: 'site'
        },
        //server details
        server: {
            host: '127.0.0.1',
            port: '3421'
        }
    }
};
module.exports = config;