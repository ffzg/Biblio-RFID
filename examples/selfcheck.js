
// mock console
if(!window.console) {
	window.console = new function() {
		this.info = function(str) {};
		this.error = function(str) {};
		this.debug = function(str) {};
	};
}

var state;
var scan_timeout;

function change_page(new_state) {
	if ( state != new_state ) {

		if ( new_state == 'checkin' ) {
			new_state = 'circulation'; // page has different name
			$('.checkout').hide();
			$('.checkin').show();
		} else if ( new_state == 'checkout' ) {
			new_state = 'circulation'; // page has different name
			$('.checkout').show();
			$('.checkin').hide();
		}

		state = new_state;

		$('.page').each( function(i,el) {
			if ( el.id != new_state ) {
				$(el).hide();
			} else {
				$(el).show();
			}
		});
		console.info('change_page', state);

		if ( state == 'start' ) {
			start_scan();
		}
		if ( state == 'error' ) {
			// FIXME: implement timeout and go back to start
		}
	}
}

function got_visible_tags(data,textStatus) {
	var html = 'No tags in range';
	if ( data.tags ) {
		html = '<ul class="tags">';
		$.each(data.tags, function(i,tag) {
			console.debug( i, tag );
			html += '<li><tt class="' + tag.security + '">' + tag.sid;
			var content = tag.content
			if (typeof content === undefined && typeof tag.borrower !== undefined) 
				content = tag.borrower.cardnumber;

			var is_book = false;
			var is_borrower = false;

			if ( content ) {
				var link;
				if ( content.length = 10 && content.substr(0,3) == 130 ) { // book
					is_book = true;
					link = 'catalogue/search.pl?q=';
				} else if ( content.length == 12 && content.substr(0,2) == 20 ) {
					is_borrower = true;
					link = 'members/member.pl?member=';
				} else {
					html += '<b>UNKNOWN TAG</b> '+content;
				}

				if ( link ) {
					html += ' <a href="http://koha.example.com:8080/cgi-bin/koha/'
						+ link + content
						+ '" title="lookup in Koha" target="koha-lookup">' + content + '</a>';
						+ '</tt>';
				}

				console.debug( 'calling', state, content );
				window[state]( content ); // call function with barcode

			}
		});
		html += '</ul>';
	}

	var arrows = Array( 8592, 8598, 8593, 8599, 8594, 8600, 8595, 8601 );

	html = '<div class=status>'
		+ textStatus
		+ ' &#' + arrows[ data.time % arrows.length ] + ';'
		+ '</div>'
		+ html
		;
	$('#tags').html( html );
	scan_timeout = window.setTimeout(function(){
		scan_tags();
	},200);	// re-scan every 200ms
};

function scan_tags() {
	if ( $('input#pull-reader').attr('checked') ) {
		console.info('scan_tags');
		$.getJSON("/scan?callback=?", got_visible_tags);
	}
}

function start_scan() {
	$('input#pull-reader').attr('checked', true);
	scan_tags();
}

function stop_scan() {
	$('input#pull-reader').attr('checked', '');
}

$(document).ready(function() {
		$('input#pull-reader').click( function() {
			scan_tags();
		});

		$('div#tags').click( function() {
			$('input#pull-reader').attr('checked', false);
		} );

		change_page('start');
});

function fill_in( where, value ) {
	$('.'+where).each(function(i, el) {
		$(el).html(value);
	});

}

/* Selfcheck state actions */

var borrower_cardnumber;
var circulation_type;
var book_barcodes;

function start( cardnumber ) {

	if ( cardnumber.length != 12 || cardnumber.substr(0,2) != "20" ) {
		console.error(cardnumber, ' is not borrower card');
		return;
	}

	borrower_cardnumber = cardnumber;
	circulation_type = 'checkout';
	book_barcodes = {};

	change_page('borrower_check');
}

function borrower_check() {

	stop_scan();

	fill_in( 'borrower_number', borrower_cardnumber );

	$.getJSON('/sip2/patron_info/'+borrower_cardnumber)
	.done( function( data ) {
		console.info('patron', data);
		fill_in( 'borrower_name', data['AE'] );
		fill_in( 'borrower_email', data['BE'] );
		fill_in( 'hold_items',    data['fixed'].substr( 2 + 14 + 3 + 18 + ( 0 * 4 ), 4 ) ) * 1;
		fill_in( 'overdue_items', data['fixed'].substr( 2 + 14 + 3 + 18 + ( 1 * 4 ), 4 ) ) * 1;
		change_page('borrower_info');
	}).fail( function(data) {
		change_page('error');
	});
}

function borrower_info() {
	// nop
}

function circulation( barcode ) {
	if ( barcode
			&& barcode.length == 10
			&& barcode.substr(0,3) == 130
			&& ! book_barcodes[barcode]
	) { // book, not seen yet
		$.getJSON('/sip2/'+circulation_type+'/'+borrower_cardnumber+'/'+barcode , function( data ) {
			console.info( circulation_type, data );
			$('ul#books').append('<li>' + data['AJ'] + ' <small>' + data['AF'] + '</small></li>');
			book_barcodes[ barcode ] = 1;
			console.debug( book_barcodes );
		}).fail( function() {
			change_page('error');
		});
	}
}
