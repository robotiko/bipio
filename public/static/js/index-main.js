require.config({
  baseUrl : "/static/js",
  paths: {
    jquery: 'vendor/jquery/jquery-min',
    jquery_b64 : 'vendor/jquery/jquery.base64.min',
    bootstrap : 'vendor/bootstrap/bootstrap-bundle',
    'bootstrap.templar' : 'vendor/bootstrap/bootstrap-templar',
    moment : 'vendor/moment.min',
    momenttz : 'vendor/moment-timezone.min',
    momenttzdata : 'vendor/moment-timezone-data',
    underscore: 'vendor/underscore/underscore-min',
    backbone: 'vendor/backbone/backbone-min',
    sessionstorage: "vendor/backbone/backbone.sessionStorage",
    'backbone.validator' : 'vendor/backbone/backbone-validation-amd-min',
    'd3' : 'vendor/d3/d3.min',
    'select2' : 'vendor/select2',
    'templar' : 'vendor/templar',
    'hopscotch' : 'vendor/hopscotch-0.1.2',

    bipclient: 'client',

    isotope : 'vendor/jquery.isotope.min',

    medium : 'vendor/medium-editor',

    // master (context) collections
    c_domain : 'collections/domain/c_domain_all',
    c_channel : 'collections/channel/c_channel_all',
    c_channel_bip_list : 'collections/channel/c_channel_bip_list',
    c_mount_local : 'collections/mount/c_mount_local',
    c_bip : 'collections/bip/c_bip_all',
    c_bip_desc : 'collections/bip/c_bip_descriptions',
    c_bip_share : 'collections/bip/c_bip_share',
    c_bip_log : 'collections/bip/c_bip_log',
    c_channel_log : 'collections/channel/c_channel_log',
    c_pod : 'collections/channel/c_pod_all',
    c_feed : 'collections/feed/c_feed_all'
  },
  shim : {
    "backbone": {
      deps: ["underscore", "jquery"],
      exports: "Backbone"  //attaches "Backbone" to the window object
    },
    'bootstrap': [ 'jquery' ],
    'backbone.validator' : {
      deps : [ 'backbone' ]
    },
    "d3" : {
      exports : "d3"
    },
    'bipclient' : {
      exports : 'BipClient'
    },
    "jquery_b64" : {
      deps : [ "jquery" ]
    },
  }
});

require(['jquery', 'bipclient' ], function($, BipClient) {

  $('#sign-in-submit').click(function() {
    BipClient.login(
      $('#login_username').val(),
      $('#login_password').val(),
      function(err, response) {
        if (err) {
          $('#error-signup').show();
        } else {
          $('#error-signup').hide();
          require(['dash-main']);
        }
      }
      );
  });

  $('#login_password').keyup(function (e) {
    e.preventDefault();
    if (e.which == 13) {
      $('#sign-in-submit').trigger('click');
    }
  });

  $('#login_username').keyup(function (e) {
    e.preventDefault();
    if (e.which == 13) {
      $('#sign-in-submit').trigger('click');
    }
  });

  $('#sign-in-btn').click(function(ev) {
    // bullshit.
    var x = setTimeout(function() {
      $("#login_username").focus()
    }, 100);
  });

  BipClient.init({
    endpoint : 'http://dev-local.bip.io:5000'
  });

});