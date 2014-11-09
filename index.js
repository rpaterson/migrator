'use static';

var _         = require('lodash');
var Bluebird  = require('bluebird');
var fs        = require('fs');
var Migration = require('./lib/migration');
var path      = require('path');
var redefine  = require('redefine');

var Migrator = module.exports = redefine.Class({
  constructor: function (options) {
    this.options = _.extend({
      storage:           'json',
      storageOptions:    {},
      upName:            'up',
      downName:          'down',
      migrationsPath:    path.resolve(process.cwd(), 'migrations'),
      migrationsPattern: /^\d+[\w-]+\.js$/
    }, options);

    this.storage = this._initStorage();
  },

  execute: function (options) {
    var self = this;

    options = _.extend({
      migrations: [],
      method:     'up'
    }, options || {});

    return Bluebird
      .map(options.migrations, function (migration) {
        return self._findMigration(migration);
      })
      .then(function (migrations) {
        return _.extend(options, { migrations: migrations });
      })
      .then(function (options) {
        return Bluebird.each(options.migrations, function (migration) {
          return self
            ._wasExecuted(migration)
            .tap(function (executed) {
              if (!executed || (options.method === 'down')) {
                return (migration[options.method] || Bluebird.resolve).call(migration);
              }
            })
            .then(function (executed) {
              if (!executed && (options.method === 'up')) {
                return self.storage.logMigration(migration.file);
              } else if (options.method === 'down') {
                return self.storage.unlogMigration(migration.file);
              }
            });
        });
      });
  },

  executed: function () {
    return this.storage.executed().bind(this).map(function (file) {
      return new Migration(file);
    });
  },

  pending: function () {
    return this
      ._findMigrations()
      .bind(this)
      .then(function (all) {
        return Bluebird.join(all, this.executed());
      })
      .spread(function (all, executed) {
        var executedFiles = executed.map(function (migration) {
          return migration.file;
        });

        return all.filter(function (migration) {
          return executedFiles.indexOf(migration.file) === -1;
        }).sort(function (a, b) {
          if (a.file > b.file) {
            return 1;
          } else  if (a.file < b.file) {
            return -1;
          } else {
            return 0;
          }
        });
      });
  },

  up: function (options) {
    options = _.extend({
      to: null
    }, options || {});

    return this
      .pending()
      .bind(this)
      .map(function (migration) { return migration.file; })
      .reduce(function (acc, migration) {
        if (acc.add) {
          acc.migrations.push(migration);

          if (options.to && (migration.indexOf(options.to) === 0)) {
            // Stop adding the migrations once the final migration
            // has been added.
            acc.add = false;
          }
        }

        return acc;
      }, { migrations: [], add: true })
      .get('migrations')
      .then(function (migrationFiles) {
        return this.execute({
          migrations: migrationFiles,
          method: 'up'
        });
      });
  },

  down: function (options) {
    options = _.extend({
      to: null
    }, options || {});

    return this.
      executed()
      .bind(this)
      .then(function(migrations) {
        return migrations.reverse();
      })
      .map(function (migration) { return migration.file })
      .reduce(function (acc, migration) {
        if (acc.add) {
          acc.migrations.push(migration);

          if (options.to && (migration.indexOf(options.to) === 0)) {
            // Stop adding the migrations once the final migration
            // has been added.
            acc.add = false;
          }
        }

        return acc;
      }, { migrations: [], add: true })
      .get('migrations')
      .then(function (migrationFiles) {
        var migrations = migrationFiles;

        if (!options.to && (migrationFiles.length > 0)) {
          migrations = [migrationFiles[0]];
        }

        return this.execute({
          migrations: migrations,
          method:     'down'
        });
      });
  },

  _initStorage: function () {
    var Storage;

    try {
      Storage = require('./lib/storages/' + this.options.storage);
    } catch (e) {
      // We have not been able to find the storage locally.
      // Let's try to require a module instead.
    }

    try {
      Storage = Storage || require(this.options.storage);
    } catch (e) {
      throw new Error('Unable to resolve the storage: ' + this.options.storage);
    }

    return new Storage(this.options);
  },

  _findMigrations: function () {
    return Bluebird
      .promisify(fs.readdir)(this.options.migrationsPath)
      .bind(this)
      .filter(function (file) {
        return this.options.migrationsPattern.test(file);
      })
      .map(function (file) {
        return this.options.migrationsPath + file;
      })
      .map(function (path) {
        return new Migration(path);
      });
  },

  _findMigration: function (needle) {
    return this
      ._findMigrations()
      .then(function (migrations) {
        return migrations.filter(function (migration) {
          return migration.file.indexOf(needle) === 0;
        })[0];
      });
  },

  _wasExecuted: function (_migration) {
    return this.executed().then(function (migrations) {
      return migrations.filter(function (migration) {
        return migration.file === _migration.file;
      })[0];
    });
  }
});