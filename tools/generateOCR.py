# Generate OCR-files
#
# The generated file is NOT a valid OCR-file. The first 8 character in the 
# amount post 1 of each transactionrecord as well as the amount and kid 
# number is correct and the date is a random date. All other positions in the
# amount post 1 is random numbers and all other lines are random.
#
# A input file named 'kid.txt' must be provided. The format of the file is a
# kid number and amount on each line seperated with a space.

from random import randint

def random_int_str(length):
    int_str = ""
    for i in range(length):
        int_str += str(randint(0,9))
    return int_str

def random_line():
    return "NY" + random_int_str(78) + '\r\n'

def random_date():
    date = "{:>02d}".format(randint(1,31))
    date += "{:>02d}".format(randint(1,12))
    date += "{:>02d}".format(randint(0, 99))
    return date 

def kid_line(kid, amount):
    line = "NY091330" + random_int_str(7) + random_date() + random_int_str(11) 
    line += "{0:>017d}{1:>025s}".format(amount, kid)
    line += random_int_str(6)
    return line + '\r\n'

def main():
    kid_file = open('kid.txt', 'r')
    kid_list = []
    amount_list = []
    for line in kid_file.readlines():
        kid, amount = line.split()
        amount = int(round(100*float(amount)))
        kid_list.append(kid)
        amount_list.append(amount)
    kid_file.close()
    
    ocr_file = open('test.ocr', 'w')
    ocr_file.write(random_line())
    ocr_file.write(random_line())
    for kid, amount in zip(kid_list, amount_list):
        ocr_file.write(kid_line(kid, amount))
        for i in range(randint(1, 2)):
            ocr_file.write(random_line())
    ocr_file.write(random_line())
    ocr_file.write(random_line())
    ocr_file.close()

if __name__ == '__main__':
    main()
