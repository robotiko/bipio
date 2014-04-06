require.config({
  baseUrl : "/static/js",
  paths: {
    jquery: 'vendor/jquery/jquery-min',
    jquery_b64 : 'vendor/jquery/jquery.base64.min',
    //bootstrap : 'vendor/bootstrap/bootstrap-bundle.min',
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
    "isotope" : {
      deps : [ "jquery" ]
    },
    "moment" : {
      deps : [ "jquery" ]
    },
    "momenttz" : {
      deps : [ "jquery", "moment" ]
    },
    "momenttzdata" : {
      deps : [ "momenttz" ]
    },
    "select2" : {
      deps : [ "jquery" ]
    },
    "templar" : {
      deps : [ "jquery" ]
    },
    "hopscotch" : {
      deps : [ "jquery" ]
    }
  }
});

require([
  'underscore',
  'backbone',
  'dash',
  'bipclient',
  'c_domain',
  'c_channel',
  'c_pod',
  'c_bip',
  'c_bip_desc',
  'c_bip_share',
  'c_mount_local',
  'c_feed',
  'backbone.validator',
  'bootstrap',
  'moment',
  //'momenttz',
  //'momenttzdata',
  'medium',
  'select2',
  'templar',
  'hopscotch'
  ], function(_, Backbone, Dash, BipClient, DomainCollection,
    ChannelCollection, PodCollection, BipCollection, BipDescCollection,
    BipShareCollection, MountLocalCollection, FeedCollection){

    _.extend(Backbone.Model.prototype, Backbone.Validation.mixin);

    var c_domain = new DomainCollection();
    BipClient.setCollection('domain', c_domain);

    var c_channel = new ChannelCollection();
    BipClient.setCollection('channel', c_channel);

    var c_bip = new BipCollection();
    BipClient.setCollection('bip', c_bip);

    var c_bip_desc = new BipDescCollection();
    BipClient.setCollection('bip_descriptions', c_bip_desc);

    var c_bip_share = new BipShareCollection();
    BipClient.setCollection('bip_shares', c_bip_share);

    var c_pod = new PodCollection();
    BipClient.setCollection('pod', c_pod);

    var c_mounts = new MountLocalCollection();

    var c_feed = new FeedCollection();
    BipClient.setCollection('feed', c_feed);

    var retries = 0, timer;

    function retry() {
      retries++;
      if (retries > 5) {
        window.location = '/timeout';
      } else {
        setTimeout(function() {
          init();
        }, 2000);
      }
    }

    function bootstrap() {
      // prefetch channel and domain lists
      $.when(
        c_channel.fetch(
        {
          success : function() {
            BipClient.decorateChannels();
          }
        }
        ),
        c_domain.fetch(),
        c_pod.fetch(
        {
          success : function() {
            BipClient.decorateChannels();
          }
        }
        )
      ).done(
        function(){
          Dash.initialize();
        }
      );

      // only need channels to bootstrap
      // so load everything else here.
      c_bip.fetch({ reset : true });
      c_bip_desc.fetch({ reset : true });
      c_bip_share.fetch( { reset : true });
      c_feed.fetch();
    }

    function init() {
      BipClient.init().then(function() {
        c_mounts.fetch({
          success : function(collection, models) {
            var model = collection.where({
              active : true
            }).shift();

            if (model) {
              BipClient.setCredentials(
                model.get('username'),
                model.get('token'),
                model.get('url')
                );
            }
            bootstrap();
          }
        });
      },
      function() {
        retry();
      });
    }

    init();
  });